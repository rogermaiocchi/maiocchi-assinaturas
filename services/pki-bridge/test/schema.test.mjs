import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8");

test("schema persiste hashes, idempotência e estado remoto cifrado", () => {
  assert.match(schema, /provider_state_ciphertext bytea NOT NULL/i);
  assert.match(schema, /idempotency_key char\(64\) NOT NULL UNIQUE/i);
  assert.match(schema, /octet_length\(sha256\) = 32/i);
  assert.doesNotMatch(schema, /provider_state\s+text|api_key|private_key|pin\s+/i);
});

test("schema impede exclusão em cascata da trilha criptográfica", () => {
  assert.doesNotMatch(schema, /ON DELETE CASCADE/i);
  assert.match(schema, /pki_events/i);
  assert.match(schema, /pki_artifacts/i);
});
