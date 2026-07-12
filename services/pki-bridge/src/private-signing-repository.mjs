import { randomUUID } from "node:crypto";

function hexBuffer(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError("SHA-256 digest is invalid");
  return Buffer.from(value, "hex");
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

  async event(ticketId, eventType, outcome, details) {
    await this.pool.query(
      `INSERT INTO pades_private_ticket_events (ticket_id, event_type, outcome, correlation_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [ticketId, eventType, outcome, randomUUID(), JSON.stringify(details || {})],
    );
  }
}
