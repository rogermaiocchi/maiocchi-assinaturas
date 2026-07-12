import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadValidatorKeys } from "../src/server.mjs";

test("carrega keyring temporal e mantém diretório sem manifesto fail-closed", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-validator-keys-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await loadValidatorKeys(root)).size, 0);

  const { publicKey } = generateKeyPairSync("ed25519");
  await writeFile(path.join(root, "validator-2026-01.pub.pem"), publicKey.export({ type: "spki", format: "pem" }), { mode: 0o440 });
  await writeFile(path.join(root, "keyring.json"), JSON.stringify({
    version: 1,
    keys: [{
      keyId: "validator-2026-01",
      status: "active",
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
    }],
  }), { mode: 0o440 });

  const keys = await loadValidatorKeys(root);
  assert.equal(keys.size, 1);
  assert.equal(keys.get("validator-2026-01").status, "active");
  assert.equal(keys.get("validator-2026-01").key.asymmetricKeyType, "ed25519");
});

test("rejeita intervalo temporal inválido", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-invalid-keyring-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "keyring.json"), JSON.stringify({
    version: 1,
    keys: [{
      keyId: "validator-invalid",
      status: "active",
      notBefore: "2027-01-01T00:00:00.000Z",
      notAfter: "2026-01-01T00:00:00.000Z",
    }],
  }));
  await assert.rejects(loadValidatorKeys(root), /validity interval is invalid/i);
});
