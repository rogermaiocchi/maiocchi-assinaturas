const STORAGE_COLUMNS = [
  "source_pdf_storage_key",
  "presentation_pdf_storage_key",
  "evidence_page_storage_key",
  "signed_pdf_storage_key",
];

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function requireDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) throw new TypeError("retention cutoff must be a valid date");
  return value;
}

function storageKeys(ticket) {
  return [...new Set(STORAGE_COLUMNS.map((column) => ticket[column]).filter(Boolean))];
}

export class PostgresRetentionRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async purgeExpiredPrivateTickets({ cutoff, limit, dryRun = false }) {
    requireDate(cutoff);
    positiveInteger(limit, "retention limit");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('maiocchi-pki-retention'))");
      const result = await client.query(
        `SELECT id, ${STORAGE_COLUMNS.join(", ")}
           FROM pades_private_tickets
          WHERE status <> 'completed' AND expires_at <= $1
          ORDER BY expires_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $2`,
        [cutoff, limit],
      );
      if (dryRun || result.rowCount === 0) {
        await client.query("ROLLBACK");
        return { tickets: result.rowCount, artifactsQueued: 0 };
      }

      let artifactsQueued = 0;
      for (const ticket of result.rows) {
        for (const storageKey of storageKeys(ticket)) {
          const queued = await client.query(
            `INSERT INTO artifact_deletion_queue (storage_key, source_ticket_id, reason)
             VALUES ($1, $2, 'expired-private-ticket')
             ON CONFLICT (storage_key) WHERE status = 'pending' DO NOTHING`,
            [storageKey, ticket.id],
          );
          artifactsQueued += queued.rowCount;
        }
      }
      const ticketIds = result.rows.map(({ id }) => id);
      await client.query("DELETE FROM pades_remote_sessions WHERE ticket_id = ANY($1::uuid[])", [ticketIds]);
      await client.query("DELETE FROM pades_private_ticket_events WHERE ticket_id = ANY($1::uuid[])", [ticketIds]);
      await client.query("DELETE FROM pades_private_tickets WHERE id = ANY($1::uuid[])", [ticketIds]);
      await client.query("COMMIT");
      return { tickets: result.rowCount, artifactsQueued };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async pruneExpiredNonces() {
    const result = await this.pool.query("DELETE FROM internal_request_nonces WHERE expires_at <= now()");
    return result.rowCount;
  }

  async pendingArtifactDeletions(limit, queueCutoff) {
    positiveInteger(limit, "retention limit");
    requireDate(queueCutoff);
    const result = await this.pool.query(
      `SELECT id, storage_key
         FROM artifact_deletion_queue
        WHERE status = 'pending' AND created_at <= $2
        ORDER BY created_at, id
        LIMIT $1`,
      [limit, queueCutoff],
    );
    return result.rows;
  }

  async artifactIsReferenced(storageKey) {
    const result = await this.pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM pades_private_tickets
          WHERE $1 = ANY(ARRAY[source_pdf_storage_key, presentation_pdf_storage_key,
                               evidence_page_storage_key, signed_pdf_storage_key])
         UNION ALL
         SELECT 1 FROM pki_workflows WHERE frozen_pdf_storage_key = $1
         UNION ALL
         SELECT 1 FROM pki_artifacts WHERE storage_key = $1
         UNION ALL
         SELECT 1 FROM authenticity_records
          WHERE $1 = ANY(ARRAY[original_storage_key, validation_report_storage_key,
                               validator_attestation_storage_key, representation_storage_key,
                               envelope_storage_key])
       ) AS referenced`,
      [storageKey],
    );
    return result.rows[0].referenced;
  }

  async completeArtifactDeletion(id, status) {
    if (!["deleted", "retained"].includes(status)) throw new TypeError("retention resolution status is invalid");
    await this.pool.query(
      `UPDATE artifact_deletion_queue
          SET status = $2, resolved_at = now(), last_error = NULL, updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [id, status],
    );
  }

  async failArtifactDeletion(id, error) {
    await this.pool.query(
      `UPDATE artifact_deletion_queue
          SET attempts = attempts + 1, last_error = left($2, 500), updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [id, error instanceof Error ? error.message : String(error)],
    );
  }
}

export async function runRetention({
  repository,
  artifactStore,
  cutoff,
  queueCutoff = new Date(),
  limit = 100,
  dryRun = false,
  allowArtifactDeletion = false,
}) {
  const ticketResult = await repository.purgeExpiredPrivateTickets({ cutoff, limit, dryRun });
  if (dryRun) {
    return { ...ticketResult, noncesDeleted: 0, artifactsDeleted: 0, artifactsRetained: 0, errors: 0 };
  }

  const result = {
    ...ticketResult,
    noncesDeleted: await repository.pruneExpiredNonces(),
    artifactsDeleted: 0,
    artifactsAbsent: 0,
    artifactsRetained: 0,
    artifactsDeferred: 0,
    errors: 0,
  };
  const pending = await repository.pendingArtifactDeletions(limit * 4, queueCutoff);
  if (!allowArtifactDeletion) {
    result.artifactsDeferred = pending.length;
    return result;
  }
  for (const { id, storage_key: storageKey } of pending) {
    try {
      if (await repository.artifactIsReferenced(storageKey)) {
        result.artifactsRetained += 1;
        await repository.completeArtifactDeletion(id, "retained");
      } else {
        if (await artifactStore.delete(storageKey)) result.artifactsDeleted += 1;
        else result.artifactsAbsent += 1;
        await repository.completeArtifactDeletion(id, "deleted");
      }
    } catch (error) {
      result.errors += 1;
      await repository.failArtifactDeletion(id, error);
    }
  }
  return result;
}
