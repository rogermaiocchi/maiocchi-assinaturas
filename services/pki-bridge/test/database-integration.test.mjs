import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { Pool } from "pg";
import test from "node:test";
import { FileArtifactStore } from "../src/artifact-store.mjs";
import { canonicalize, sha256Hex } from "../src/authenticity-contract.mjs";
import { applyMigrations, PostgresAuthenticityRepository } from "../src/authenticity-repository.mjs";
import { registerGoldStandardDocument } from "../src/authenticity-service.mjs";
import { PostgresInternalReplayGuard } from "../src/internal-replay-guard.mjs";
import { buildValidationAttestationClaims, signValidationAttestation } from "../src/validation-attestation.mjs";
import { PostgresPrivateSigningRepository } from "../src/private-signing-repository.mjs";

const databaseUrl = process.env.PKI_TEST_DATABASE_URL;

async function resetTestData(pool) {
  const result = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'pki_schema_migrations' ORDER BY tablename",
  );
  const tables = result.rows.map(({ tablename }) => {
    if (!/^[a-z0-9_]+$/.test(tablename)) throw new Error("unsafe test table name");
    return `"${tablename}"`;
  });
  if (tables.length) await pool.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}

test("substitui sessão PAdES preparada somente com compare-and-swap", { skip: !databaseUrl }, async (context) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  context.after(async () => pool.end());
  await applyMigrations(pool);
  await resetTestData(pool);
  const ticketId = randomUUID();
  const originalSessionId = randomUUID();
  const replacementSessionId = randomUUID();
  await pool.query(
    `INSERT INTO pades_private_tickets
      (id, token_sha256, document_name, source_pdf_sha256, source_pdf_storage_key, source_pdf_size,
       status, provider_session_id, certificate_fingerprint_sha256, to_be_signed_sha256, expires_at)
     VALUES ($1, $2, 'retry.pdf', $3, 'sha256/retry.pdf', 10, 'prepared', $4, $5, $6,
             now() + interval '10 minutes')`,
    [ticketId, Buffer.alloc(32, 9), Buffer.alloc(32, 10), originalSessionId,
      Buffer.alloc(32, 3), Buffer.alloc(32, 4)],
  );
  const ticket = (await pool.query("SELECT * FROM pades_private_tickets WHERE id = $1", [ticketId])).rows[0];
  const repository = new PostgresPrivateSigningRepository(pool);

  const replaced = await repository.replacePrepared(ticket, {
    providerSessionId: replacementSessionId,
    certificateFingerprint: "05".repeat(32),
    toBeSignedSha256: "06".repeat(32),
  });

  assert.equal(replaced.provider_session_id, replacementSessionId);
  assert.deepEqual(replaced.certificate_fingerprint_sha256, Buffer.alloc(32, 5));
  assert.deepEqual(replaced.to_be_signed_sha256, Buffer.alloc(32, 6));
  await assert.rejects(
    repository.replacePrepared(ticket, {
      providerSessionId: randomUUID(), certificateFingerprint: "07".repeat(32),
      toBeSignedSha256: "08".repeat(32),
    }),
    (error) => error.status === 409,
  );
  const events = await pool.query(
    "SELECT event_type, outcome FROM pades_private_ticket_events WHERE ticket_id = $1 ORDER BY id",
    [ticketId],
  );
  assert.deepEqual(events.rows, [{ event_type: "signature_reprepared", outcome: "success" }]);
});

test("migra e persiste a trilha de autenticidade no PostgreSQL", { skip: !databaseUrl }, async (context) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-pg-artifacts-"));
  context.after(async () => {
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  await applyMigrations(pool);
  await applyMigrations(pool);
  await resetTestData(pool);
  const migrations = await pool.query("SELECT name FROM pki_schema_migrations ORDER BY name");
  assert.deepEqual(migrations.rows.map((row) => row.name), [
    "001_initial.sql",
    "002_authenticity_gold_standard.sql",
    "003_private_pades_provider.sql",
    "004_remote_pades_sessions.sql",
    "005_embedded_pades_evidence.sql",
    "006_internal_request_nonces.sql",
  ]);

  const replayGuard = new PostgresInternalReplayGuard(pool);
  const requestAuth = {
    nonce: "0123456789abcdef0123456789abcdef",
    timestamp: String(Math.floor(Date.now() / 1000)),
    expiresAt: new Date(Date.now() + 300_000),
  };
  assert.equal(await replayGuard.consume(requestAuth), true);
  assert.equal(await replayGuard.consume(requestAuth), false);
  assert.equal(await replayGuard.consume({
    nonce: "fedcba9876543210fedcba9876543210",
    timestamp: String(Math.floor(Date.now() / 1000) - 301),
    expiresAt: new Date(Date.now() - 1_000),
  }), false);

  const ticketId = randomUUID();
  const firstRemoteId = randomUUID();
  await pool.query(
    `INSERT INTO pades_private_tickets
      (id, token_sha256, document_name, source_pdf_sha256, source_pdf_storage_key, source_pdf_size, status, expires_at)
     VALUES ($1, $2, 'remote.pdf', $3, 'sha256/test.pdf', 10, 'pending', now() + interval '10 minutes')`,
    [ticketId, Buffer.alloc(32, 1), Buffer.alloc(32, 2)],
  );
  await pool.query(
    `INSERT INTO pades_remote_sessions (id, ticket_id, provider_session_id, provider_kind, status)
     VALUES ($1, $2, $3, 'rest_pki_core', 'pending')`,
    [firstRemoteId, ticketId, randomUUID()],
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO pades_remote_sessions (id, ticket_id, provider_session_id, provider_kind, status)
       VALUES ($1, $2, $3, 'rest_pki_core', 'pending')`,
      [randomUUID(), ticketId, randomUUID()],
    ),
    /pades_remote_sessions_one_pending_idx/i,
  );
  await pool.query("UPDATE pades_remote_sessions SET status = 'cancelled' WHERE id = $1", [firstRemoteId]);
  await pool.query(
    `INSERT INTO pades_remote_sessions (id, ticket_id, provider_session_id, provider_kind, status)
     VALUES ($1, $2, $3, 'rest_pki_core', 'pending')`,
    [randomUUID(), ticketId, randomUUID()],
  );
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM pades_remote_sessions WHERE ticket_id = $1", [ticketId])).rows[0].count, 2);

  const workflowId = randomUUID();
  await pool.query(
    `INSERT INTO pki_workflows
      (id, account_id, docuseal_submission_id, revision, modality, status)
     VALUES ($1, 1, 1, 1, 'icp_brasil', 'completed')`,
    [workflowId],
  );

  const pdfDocument = await PDFDocument.create();
  pdfDocument.addPage([300, 400]);
  const signedPdf = Buffer.from(await pdfDocument.save());
  const validation = {
    status: "valid",
    format: "PAdES",
    infrastructure: "ICP-Brasil",
    profile: "AD-RB",
    policyOid: "2.16.76.1.7.1.12.2.1",
    docMdp: "valid",
    coverage: "whole-document",
    validatedAt: "2026-07-12T12:01:00.000Z",
    validator: "Adapter de integração",
    signatures: [{
      status: "valid",
      chainStatus: "valid",
      revocationStatus: "good",
      certificateFingerprintSha256: "a".repeat(64),
      signingTime: "2026-07-12T12:00:00.000Z",
    }],
  };
  const validationReport = { source: "integration-fixture", validation };
  const { privateKey } = generateKeyPairSync("ed25519");
  const { privateKey: validatorPrivateKey, publicKey: validatorPublicKey } = generateKeyPairSync("ed25519");
  const validationAttestation = signValidationAttestation(buildValidationAttestationClaims({
    workflowId,
    revision: 1,
    issuedAt: validation.validatedAt,
    signedPdfSha256: sha256Hex(signedPdf),
    validationReportSha256: sha256Hex(canonicalize(validationReport)),
    validation,
  }), { privateKey: validatorPrivateKey, keyId: "integration-validator" });
  const repository = new PostgresAuthenticityRepository(pool);
  const registrationInput = {
    workflowId,
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:30.000Z",
  };
  const registrationDependencies = {
    repository,
    artifactStore: new FileArtifactStore(root),
    privateKey,
    keyId: "integration-key",
    allowedPolicyOids: new Set([validation.policyOid]),
    validatorKeys: new Map([["integration-validator", {
      key: validatorPublicKey,
      status: "active",
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
    }]]),
  };
  const attempts = await Promise.all([
    registerGoldStandardDocument(registrationInput, registrationDependencies),
    registerGoldStandardDocument(registrationInput, registrationDependencies),
  ]);
  const result = attempts.find((attempt) => !attempt.replayed);
  const replay = attempts.find((attempt) => attempt.replayed);
  assert.ok(result);
  assert.ok(replay);
  assert.equal(replay.publicId, result.publicId);

  const entry = await repository.findByPublicId(result.publicId);
  assert.equal(entry.status, "active");
  assert.equal(entry.disclosure_mode, "restricted");
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM authenticity_documents")).rows[0].count, 1);

  await repository.appendObservation(entry, { eventType: "hash_matched", outcome: "success", details: { channel: "integration-test" } });
  assert.equal(
    await repository.appendObservation(entry, { eventType: "hash_matched", outcome: "success", details: { channel: "duplicate" } }),
    false,
  );
  await repository.appendDocumentState(entry, { status: "revoked", reason: "integration-test" });
  assert.equal((await repository.findByPublicId(result.publicId)).status, "revoked");

  const events = await pool.query(
    "SELECT previous_event_sha256, event_sha256 FROM authenticity_audit_events WHERE document_id = $1 ORDER BY id",
    [entry.document_id],
  );
  assert.equal(events.rowCount, 2);
  assert.equal(events.rows[0].previous_event_sha256, null);
  assert.deepEqual(events.rows[1].previous_event_sha256, events.rows[0].event_sha256);

  const observations = await pool.query(
    "SELECT event_type, trust_level, observation_window FROM authenticity_verification_events WHERE document_id = $1",
    [entry.document_id],
  );
  assert.equal(observations.rowCount, 1);
  assert.equal(observations.rows[0].event_type, "hash_matched");
  assert.equal(observations.rows[0].trust_level, "untrusted_client_observation");
  assert.equal(new Date(observations.rows[0].observation_window).getUTCMinutes() % 10, 0);

  const states = await pool.query(
    "SELECT status, previous_state_sha256, state_sha256 FROM authenticity_document_states WHERE document_id = $1 ORDER BY id",
    [entry.document_id],
  );
  assert.equal(states.rowCount, 2);
  assert.deepEqual(states.rows[1].previous_state_sha256, states.rows[0].state_sha256);

  await assert.rejects(
    pool.query("UPDATE authenticity_records SET signing_key_id = 'altered' WHERE id = $1", [entry.record_id]),
    /append-only/i,
  );
  await assert.rejects(
    pool.query("UPDATE authenticity_documents SET public_id = 'MAI-2026-2222-2222-2222-2222' WHERE id = $1", [entry.document_id]),
    /append-only/i,
  );
});
