import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8");
const authenticitySchema = await readFile(new URL("../db/002_authenticity_gold_standard.sql", import.meta.url), "utf8");
const privateProviderSchema = await readFile(new URL("../db/003_private_pades_provider.sql", import.meta.url), "utf8");

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
