import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalize } from "./authenticity-contract.mjs";

function hexBuffer(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError("SHA-256 digest is invalid");
  return Buffer.from(value, "hex");
}

function eventDigest({ previous, documentId, recordId, eventType, outcome, correlationId, details, createdAt }) {
  return createHash("sha256").update(canonicalize({
    previous: previous ? previous.toString("hex") : null,
    documentId,
    recordId,
    eventType,
    outcome,
    correlationId,
    details,
    createdAt,
  })).digest();
}

function stateDigest({ previous, documentId, recordId, status, reason, createdAt }) {
  return createHash("sha256").update(canonicalize({
    previous: previous ? previous.toString("hex") : null,
    documentId,
    recordId,
    status,
    reason,
    createdAt,
  })).digest();
}

export async function applyMigrations(pool, directory = new URL("../db/", import.meta.url)) {
  const base = directory instanceof URL ? directory : new URL(`file://${path.resolve(directory)}/`);
  const files = (await readdir(base)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('maiocchi-pki-schema-migrations'))");
    await client.query("CREATE TABLE IF NOT EXISTS pki_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of files) {
      const exists = await client.query("SELECT 1 FROM pki_schema_migrations WHERE name = $1", [name]);
      if (exists.rowCount) continue;
      const sql = await readFile(new URL(name, base), "utf8");
      await client.query("BEGIN");
      inTransaction = true;
      await client.query(sql);
      await client.query("INSERT INTO pki_schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      inTransaction = false;
    }
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('maiocchi-pki-schema-migrations'))").catch(() => undefined);
    client.release();
  }
}

const ENTRY_SELECT = `SELECT d.id AS document_id, d.workflow_id, d.registration_key, d.public_id,
       s.status, r.id AS record_id, r.envelope,
       r.envelope->'record'->'disclosure'->>'mode' AS disclosure_mode,
       r.original_storage_key, r.validation_report_storage_key,
       r.validator_attestation_storage_key, r.representation_storage_key, r.envelope_storage_key
  FROM authenticity_documents d
  JOIN LATERAL (
    SELECT state.status, state.record_id
      FROM authenticity_document_states state
     WHERE state.document_id = d.id
     ORDER BY state.id DESC
     LIMIT 1
  ) s ON true
  JOIN authenticity_records r ON r.id = s.record_id`;

async function findEntry(queryable, column, value) {
  const where = column === "public_id" ? "d.public_id = $1" : "d.workflow_id = $1";
  const result = await queryable.query(`${ENTRY_SELECT} WHERE ${where}`, [value]);
  return result.rows[0] || null;
}

function replayResult(entry) {
  return {
    documentId: entry.document_id,
    recordId: entry.record_id,
    publicId: entry.public_id,
    envelope: entry.envelope,
    replayed: true,
  };
}

export class PostgresAuthenticityRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findByWorkflowId(workflowId) {
    return findEntry(this.pool, "workflow_id", workflowId);
  }

  async findByPublicId(publicId) {
    return findEntry(this.pool, "public_id", publicId);
  }

  async saveRecord({ workflowId, registrationKey, envelope, envelopeSha256, validationAttestation, artifacts, signatures }) {
    const client = await this.pool.connect();
    const documentId = randomUUID();
    const recordId = randomUUID();
    const correlationId = randomUUID();
    const record = envelope.record;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [workflowId]);
      const existing = await findEntry(client, "workflow_id", workflowId);
      if (existing) {
        if (existing.registration_key !== registrationKey) {
          throw Object.assign(new Error("workflow already has a different authenticity record"), { status: 409 });
        }
        await client.query("COMMIT");
        return replayResult(existing);
      }

      await client.query(
        `INSERT INTO authenticity_documents (id, workflow_id, registration_key, public_id)
         VALUES ($1, $2, $3, $4)`,
        [documentId, workflowId, registrationKey, record.document.id],
      );
      await client.query(
        `INSERT INTO authenticity_records
          (id, document_id, revision, original_storage_key, validation_report_storage_key,
           validator_attestation_storage_key, representation_storage_key, envelope_storage_key,
           envelope, envelope_sha256, jws_compact, signing_key_id, validator_attestation,
           validator_key_id, finalized_at, validated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16)`,
        [recordId, documentId, record.document.revision, artifacts.original.storageKey,
          artifacts.validationReport.storageKey, artifacts.validationAttestation.storageKey,
          artifacts.representation.storageKey, artifacts.envelope.storageKey, JSON.stringify(envelope),
          hexBuffer(envelopeSha256), envelope.proof.value, envelope.proof.keyId, validationAttestation,
          record.validation.attestation.keyId, record.document.finalizedAt, record.validation.validatedAt],
      );

      const createdAt = new Date().toISOString();
      const initialStateHash = stateDigest({ previous: null, documentId, recordId, status: "active", reason: "record-created", createdAt });
      await client.query(
        `INSERT INTO authenticity_document_states
          (document_id, record_id, status, reason, previous_state_sha256, state_sha256, created_at)
         VALUES ($1, $2, 'active', 'record-created', NULL, $3, $4)`,
        [documentId, recordId, initialStateHash, createdAt],
      );

      for (const signature of signatures) {
        await client.query(
          `INSERT INTO authenticity_signatures
            (id, record_id, signature_index, certificate_fingerprint_sha256, pades_profile,
             policy_oid, signing_time, timestamp_time, chain_status, revocation_status, validation_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'valid', 'good', 'valid')`,
          [randomUUID(), recordId, signature.index, hexBuffer(signature.certificateFingerprintSha256),
            record.signature.profile, record.signature.policyOid, signature.signingTime, signature.timestampTime || null],
        );
      }

      const hashes = [
        ["original_pades", artifacts.original],
        ["validation_report", artifacts.validationReport],
        ["validation_attestation", artifacts.validationAttestation],
        ["print_representation", artifacts.representation],
        ["authenticity_envelope", { ...artifacts.envelope, sha256: envelopeSha256 }],
      ];
      for (const [kind, artifact] of hashes) {
        await client.query(
          `INSERT INTO authenticity_hashes
            (id, record_id, artifact_kind, algorithm, digest, byte_length)
           VALUES ($1, $2, $3, 'SHA-256', $4, $5)`,
          [randomUUID(), recordId, kind, hexBuffer(artifact.sha256), artifact.size],
        );
      }

      const digest = eventDigest({ previous: null, documentId, recordId, eventType: "record_created", outcome: "success", correlationId, details: {}, createdAt });
      await client.query(
        `INSERT INTO authenticity_audit_events
          (document_id, record_id, event_type, outcome, correlation_id, previous_event_sha256, event_sha256, details, created_at)
         VALUES ($1, $2, 'record_created', 'success', $3, NULL, $4, '{}'::jsonb, $5)`,
        [documentId, recordId, correlationId, digest, createdAt],
      );
      await client.query("COMMIT");
      return { documentId, recordId, publicId: record.document.id, replayed: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async appendObservation(entry, { eventType, outcome, details = {} }) {
    const windowMilliseconds = 10 * 60 * 1000;
    const observationWindow = new Date(Math.floor(Date.now() / windowMilliseconds) * windowMilliseconds).toISOString();
    const result = await this.pool.query(
      `INSERT INTO authenticity_verification_events
        (document_id, record_id, event_type, outcome, correlation_id, observation_window, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (document_id, event_type, observation_window) DO NOTHING`,
      [entry.document_id, entry.record_id, eventType, outcome, randomUUID(), observationWindow, JSON.stringify(details)],
    );
    return result.rowCount === 1;
  }

  async appendDocumentState(entry, { status, reason }) {
    if (!["revoked", "superseded"].includes(status) || typeof reason !== "string" || reason.trim() === "") {
      throw new TypeError("document state transition is invalid");
    }
    const client = await this.pool.connect();
    const createdAt = new Date().toISOString();
    const correlationId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [entry.document_id]);
      const currentResult = await client.query(
        `SELECT status, record_id, state_sha256 FROM authenticity_document_states
          WHERE document_id = $1 ORDER BY id DESC LIMIT 1`,
        [entry.document_id],
      );
      const current = currentResult.rows[0];
      if (!current || current.status !== "active") throw Object.assign(new Error("document is already terminal"), { status: 409 });
      const stateHash = stateDigest({ previous: current.state_sha256, documentId: entry.document_id,
        recordId: current.record_id, status, reason: reason.trim(), createdAt });
      await client.query(
        `INSERT INTO authenticity_document_states
          (document_id, record_id, status, reason, previous_state_sha256, state_sha256, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [entry.document_id, current.record_id, status, reason.trim(), current.state_sha256, stateHash, createdAt],
      );
      const previousAudit = await client.query(
        "SELECT event_sha256 FROM authenticity_audit_events WHERE document_id = $1 ORDER BY id DESC LIMIT 1",
        [entry.document_id],
      );
      const previous = previousAudit.rows[0]?.event_sha256 || null;
      const eventType = status === "revoked" ? "document_revoked" : "document_superseded";
      const details = { reason: reason.trim() };
      const digest = eventDigest({ previous, documentId: entry.document_id, recordId: current.record_id,
        eventType, outcome: "success", correlationId, details, createdAt });
      await client.query(
        `INSERT INTO authenticity_audit_events
          (document_id, record_id, event_type, outcome, correlation_id, previous_event_sha256, event_sha256, details, created_at)
         VALUES ($1, $2, $3, 'success', $4, $5, $6, $7::jsonb, $8)`,
        [entry.document_id, current.record_id, eventType, correlationId, previous, digest, JSON.stringify(details), createdAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
