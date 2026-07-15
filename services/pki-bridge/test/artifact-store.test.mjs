import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileArtifactStore } from "../src/artifact-store.mjs";

test("grava por conteúdo, aplica modo somente leitura e detecta substituição", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new FileArtifactStore(root);
  const body = Buffer.from("evidencia imutavel");

  const first = await store.put(body, { extension: "json" });
  const duplicates = await Promise.all(
    Array.from({ length: 16 }, () => store.put(body, { extension: "json" })),
  );
  assert.ok(duplicates.every((duplicate) => JSON.stringify(duplicate) === JSON.stringify(first)));
  assert.deepEqual(await store.get(first.storageKey), body);
  assert.deepEqual(await store.metadata(first.storageKey), { size: body.length, immutableMode: true, encryptedAtRest: false });

  const destination = store.resolve(first.storageKey);
  await chmod(destination, 0o640);
  await writeFile(destination, "conteudo alterado");
  await assert.rejects(store.get(first.storageKey), /integrity check failed/i);
  assert.throws(() => store.resolve("../../fora.pdf"), /storage key is invalid/i);
});

test("cifra artefatos com AES-256-GCM e rejeita troca de caminho ou chave", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-encrypted-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const key = Buffer.alloc(32, 7);
  const store = new FileArtifactStore(root, { encryptionKey: key });
  const body = Buffer.from("evidencia protegida em repouso");
  const artifact = await store.put(body, { extension: "pdf" });
  const stored = await readFile(store.resolve(artifact.storageKey));

  assert.notDeepEqual(stored, body);
  assert.deepEqual(await store.get(artifact.storageKey), body);
  assert.deepEqual(await store.metadata(artifact.storageKey), { size: body.length, immutableMode: true, encryptedAtRest: true });
  await assert.rejects(
    new FileArtifactStore(root, { encryptionKey: Buffer.alloc(32, 9) }).get(artifact.storageKey),
    /authenticated decryption failed/i,
  );
});

test("migra artefato legado sem alterar a chave de conteúdo", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-legacy-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const legacy = new FileArtifactStore(root);
  const body = Buffer.from("artefato legado");
  const artifact = await legacy.put(body, { extension: "json" });
  const migrationStore = new FileArtifactStore(root, { encryptionKey: Buffer.alloc(32, 5), requireEncryption: false });

  assert.equal(await migrationStore.encryptLegacy(artifact.storageKey), true);
  assert.equal(await migrationStore.encryptLegacy(artifact.storageKey), false);
  assert.deepEqual(await new FileArtifactStore(root, { encryptionKey: Buffer.alloc(32, 5) }).get(artifact.storageKey), body);
  await assert.rejects(legacy.get(artifact.storageKey), /encryption key is unavailable/i);
});

test("exclui somente chave válida e trata ausência como idempotente", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-deleted-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const store = new FileArtifactStore(root);
  const artifact = await store.put(Buffer.from("temporario"), { extension: "pdf" });

  assert.equal(await store.delete(artifact.storageKey), true);
  assert.equal(await store.delete(artifact.storageKey), false);
  await assert.rejects(store.get(artifact.storageKey), { code: "ENOENT" });
  await assert.rejects(store.delete("../../fora.pdf"), /storage key is invalid/i);
});
