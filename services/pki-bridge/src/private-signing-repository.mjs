import { randomUUID } from "node:crypto";

function hexBuffer(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError("SHA-256 digest is invalid");
  return Buffer.from(value, "hex");
}

async function insertEvent(queryable, ticketId, eventType, outcome, details) {
  await queryable.query(
    `INSERT INTO pades_private_ticket_events (ticket_id, event_type, outcome, correlation_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [ticketId, eventType, outcome, randomUUID(), JSON.stringify(details || {})],
  );
}

export class PostgresPrivateSigningRepository {
  constructor(pool) { this.pool = pool; }

  async create({ tokenHash, documentName, sourceArtifact, expiresAt }) {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO pades_private_tickets
        (id, token_sha256, document_name, source_pdf_sha256, source_pdf_storage_key, source_pdf_size, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [id, hexBuffer(tokenHash), documentName, hexBuffer(sourceArtifact.sha256), sourceArtifact.storageKey, sourceArtifact.size, expiresAt],
    );
    await this.event(id, "ticket_created", "success", { sourcePdfSha256: sourceArtifact.sha256 });
    return { id };
  }

  async findByTokenHash(tokenHash) {
    const result = await this.pool.query("SELECT * FROM pades_private_tickets WHERE token_sha256 = $1", [hexBuffer(tokenHash)]);
    return result.rows[0] || null;
  }

  async markPrepared(ticket, { providerSessionId, certificateFingerprint, toBeSignedSha256 }) {
    const result = await this.pool.query(
      `UPDATE pades_private_tickets
          SET status = 'prepared', provider_session_id = $2, certificate_fingerprint_sha256 = $3,
              to_be_signed_sha256 = $4, prepared_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'pending' AND expires_at > now()
        RETURNING *`,
      [ticket.id, providerSessionId, hexBuffer(certificateFingerprint), hexBuffer(toBeSignedSha256)],
    );
    if (!result.rowCount) throw Object.assign(new Error("ticket is no longer pending"), { status: 409 });
    await this.event(ticket.id, "signature_prepared", "success", { certificateFingerprint, toBeSignedSha256 });
    return result.rows[0];
  }

  async markCompleted(ticket, { signedArtifact, validation }) {
    const result = await this.pool.query(
      `UPDATE pades_private_tickets
          SET status = 'completed', signed_pdf_sha256 = $2, signed_pdf_storage_key = $3,
              validation_report = $4::jsonb, completed_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'prepared' AND expires_at > now()
        RETURNING *`,
      [ticket.id, hexBuffer(signedArtifact.sha256), signedArtifact.storageKey, JSON.stringify(validation)],
    );
    if (!result.rowCount) throw Object.assign(new Error("ticket is no longer prepared"), { status: 409 });
    await this.event(ticket.id, "signature_completed", "success", { signedPdfSha256: signedArtifact.sha256 });
    return result.rows[0];
  }

  async createRemoteSession(ticket, { providerSessionId }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO pades_remote_sessions (id, ticket_id, provider_session_id, provider_kind, status)
         VALUES ($1, $2, $3, 'rest_pki_core', 'pending')
         ON CONFLICT (ticket_id) WHERE status = 'pending' DO NOTHING
         RETURNING *`,
        [randomUUID(), ticket.id, providerSessionId],
      );
      if (!result.rowCount) throw Object.assign(new Error("remote signature session already exists"), { status: 409 });
      await insertEvent(client, ticket.id, "remote_session_created", "success", { provider: "rest_pki_core" });
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findRemoteSession(ticketId) {
    const result = await this.pool.query(
      "SELECT * FROM pades_remote_sessions WHERE ticket_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
      [ticketId],
    );
    return result.rows[0] || null;
  }

  async markRemoteTerminal(ticket, { providerSessionId, status }) {
    if (!["cancelled", "expired", "failed"].includes(status)) throw new TypeError("remote terminal status is invalid");
    const result = await this.pool.query(
      `UPDATE pades_remote_sessions
          SET status = $3, completed_at = now(), updated_at = now()
        WHERE ticket_id = $1 AND provider_session_id = $2 AND status = 'pending'
        RETURNING *`,
      [ticket.id, providerSessionId, status],
    );
    if (!result.rowCount) throw Object.assign(new Error("remote signature session is not pending"), { status: 409 });
    await this.event(ticket.id, `remote_session_${status}`, status === "failed" ? "failure" : "success", { provider: "rest_pki_core" });
    return result.rows[0];
  }

  async markRemoteCompleted(ticket, { providerSessionId, signedArtifact, validation }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await client.query(
        `UPDATE pades_remote_sessions
            SET status = 'completed', completed_at = now(), updated_at = now()
          WHERE ticket_id = $1 AND provider_session_id = $2 AND status = 'pending'
          RETURNING *`,
        [ticket.id, providerSessionId],
      );
      if (!session.rowCount) throw Object.assign(new Error("remote signature session is not pending"), { status: 409 });
      const completed = await client.query(
        `UPDATE pades_private_tickets
            SET status = 'completed', signed_pdf_sha256 = $2, signed_pdf_storage_key = $3,
                validation_report = $4::jsonb, completed_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'pending' AND expires_at > now()
          RETURNING *`,
        [ticket.id, hexBuffer(signedArtifact.sha256), signedArtifact.storageKey, JSON.stringify(validation)],
      );
      if (!completed.rowCount) throw Object.assign(new Error("ticket is no longer pending"), { status: 409 });
      await insertEvent(client, ticket.id, "remote_signature_completed", "success", { signedPdfSha256: signedArtifact.sha256 });
      await client.query("COMMIT");
      return completed.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async event(ticketId, eventType, outcome, details) {
    await insertEvent(this.pool, ticketId, eventType, outcome, details);
  }
}
