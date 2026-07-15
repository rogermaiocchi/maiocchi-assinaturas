import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8");
const authenticitySchema = await readFile(new URL("../db/002_authenticity_gold_standard.sql", import.meta.url), "utf8");
const privateProviderSchema = await readFile(new URL("../db/003_private_pades_provider.sql", import.meta.url), "utf8");
const remoteProviderSchema = await readFile(new URL("../db/004_remote_pades_sessions.sql", import.meta.url), "utf8");
const evidenceSchema = await readFile(new URL("../db/005_embedded_pades_evidence.sql", import.meta.url), "utf8");
const replaySchema = await readFile(new URL("../db/006_internal_request_nonces.sql", import.meta.url), "utf8");
const retentionSchema = await readFile(new URL("../db/007_retention_queue.sql", import.meta.url), "utf8");

test("schema persiste hashes, idempotência e estado remoto cifrado", () => {
  assert.match(schema, /provider_state_ciphertext bytea NOT NULL/i);
  assert.match(schema, /idempotency_key char\(64\) NOT NULL UNIQUE/i);
  assert.match(schema, /octet_length\(sha256\) = 32/i);
  assert.doesNotMatch(schema, /provider_state\s+text|api_key|private_key|pin\s+/i);
});

test("schema do provider privado armazena somente hash do ticket e transições auditáveis", () => {
  assert.match(privateProviderSchema, /CREATE TABLE pades_private_tickets/i);
  assert.match(privateProviderSchema, /token_sha256 bytea NOT NULL UNIQUE/i);
  assert.match(privateProviderSchema, /CREATE TABLE pades_private_ticket_events/i);
  assert.match(privateProviderSchema, /private PAdES ticket identity is immutable/i);
  assert.doesNotMatch(privateProviderSchema, /token\s+text|pin\s+|private_key|ON DELETE CASCADE/i);
});

test("schema remoto vincula uma única sessão imutável ao ticket", () => {
  assert.match(remoteProviderSchema, /CREATE TABLE pades_remote_sessions/i);
  assert.match(remoteProviderSchema, /provider_session_id uuid NOT NULL UNIQUE/i);
  assert.match(remoteProviderSchema, /one_pending_idx[\s\S]+WHERE status = 'pending'/i);
  assert.match(remoteProviderSchema, /remote PAdES session identity is immutable/i);
  assert.doesNotMatch(remoteProviderSchema, /api_key|private_key|pin\s+|ON DELETE CASCADE/i);
});

test("schema de evidência vincula página final, ML-DSA e identificadores imutáveis", () => {
  for (const field of ["public_id", "document_number", "presentation_pdf_sha256", "evidence_page_sha256", "pqc_attestation", "pqc_code", "final_evidence_manifest", "final_pqc_attestation", "final_pqc_code", "signing_metadata"]) {
    assert.match(evidenceSchema, new RegExp(`ADD COLUMN ${field}`, "i"));
  }
  assert.match(evidenceSchema, /private PAdES evidence is immutable once prepared/i);
  assert.match(evidenceSchema, /private PAdES final result is immutable/i);
  assert.match(evidenceSchema, /PQC|pqc_code/i);
  assert.doesNotMatch(evidenceSchema, /private_key|api_key|pin\s+/i);
});

test("schema interno registra nonce único com expiração", () => {
  assert.match(replaySchema, /CREATE TABLE internal_request_nonces/i);
  assert.match(replaySchema, /nonce char\(32\) PRIMARY KEY/i);
  assert.match(replaySchema, /expires_at timestamptz NOT NULL/i);
  assert.doesNotMatch(replaySchema, /payload|body|secret|api_key|private_key|pin\s+/i);
});

test("schema de retenção usa fila mínima sem apagar evidência por cascata", () => {
  assert.match(retentionSchema, /CREATE TABLE artifact_deletion_queue/i);
  assert.match(retentionSchema, /id bigserial PRIMARY KEY/i);
  assert.match(retentionSchema, /storage_key text NOT NULL/i);
  assert.match(retentionSchema, /source_ticket_id uuid NOT NULL/i);
  assert.match(retentionSchema, /status IN \('pending', 'deleted', 'retained'\)/i);
  assert.match(retentionSchema, /WHERE status = 'pending'/i);
  assert.match(retentionSchema, /resolved_at timestamptz/i);
  assert.match(retentionSchema, /attempts integer NOT NULL DEFAULT 0/i);
  assert.doesNotMatch(retentionSchema, /ON DELETE CASCADE|document_name|token_sha256|certificate/i);
});

test("schema impede exclusão em cascata da trilha criptográfica", () => {
  assert.doesNotMatch(schema, /ON DELETE CASCADE/i);
  assert.match(schema, /pki_events/i);
  assert.match(schema, /pki_artifacts/i);
});

test("schema de autenticidade separa documento, assinaturas, hashes e eventos", () => {
  for (const table of ["authenticity_documents", "authenticity_records", "authenticity_document_states", "authenticity_signatures", "authenticity_hashes", "authenticity_audit_events", "authenticity_verification_events"]) {
    assert.match(authenticitySchema, new RegExp(`CREATE TABLE ${table}`, "i"));
  }
  assert.match(authenticitySchema, /previous_event_sha256 bytea/i);
  assert.match(authenticitySchema, /validator_attestation_storage_key text NOT NULL/i);
  assert.match(authenticitySchema, /validation_attestation/i);
  assert.match(authenticitySchema, /event_sha256 bytea NOT NULL/i);
  assert.match(authenticitySchema, /authenticity evidence is append-only/i);
  assert.match(authenticitySchema, /authenticity_documents_immutable/i);
  assert.match(authenticitySchema, /untrusted_client_observation/i);
  assert.match(authenticitySchema, /UNIQUE \(document_id, event_type, observation_window\)/i);
  assert.doesNotMatch(authenticitySchema, /ON DELETE CASCADE/i);
});
