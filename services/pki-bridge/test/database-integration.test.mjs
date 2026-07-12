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
import { buildValidationAttestationClaims, signValidationAttestation } from "../src/validation-attestation.mjs";

const databaseUrl = process.env.PKI_TEST_DATABASE_URL;

test("migra e persiste a trilha de autenticidade no PostgreSQL", { skip: !databaseUrl }, async (context) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-pg-artifacts-"));
  context.after(async () => {
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });

  await applyMigrations(pool);
  await applyMigrations(pool);
  const migrations = await pool.query("SELECT name FROM pki_schema_migrations ORDER BY name");
  assert.deepEqual(migrations.rows.map((row) => row.name), ["001_initial.sql", "002_authenticity_gold_standard.sql", "003_private_pades_provider.sql"]);

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
