import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  assert.deepEqual(await store.metadata(first.storageKey), { size: body.length, immutableMode: true });

  const destination = store.resolve(first.storageKey);
  await chmod(destination, 0o640);
  await writeFile(destination, "conteudo alterado");
  await assert.rejects(store.get(first.storageKey), /integrity check failed/i);
  assert.throws(() => store.resolve("../../fora.pdf"), /storage key is invalid/i);
});
