import assert from "node:assert/strict";
import test from "node:test";
import { runRetention } from "../src/retention-service.mjs";

class FakeRepository {
  constructor({ candidates = 0, queue = [], referenced = new Set() } = {}) {
    this.candidates = candidates;
    this.queue = queue;
    this.referenced = referenced;
    this.completed = [];
    this.failed = [];
    this.purgeCalls = [];
  }

  async purgeExpiredPrivateTickets(options) {
    this.purgeCalls.push(options);
    return { tickets: this.candidates, artifactsQueued: options.dryRun ? 0 : this.queue.length };
  }

  async pruneExpiredNonces() { return 3; }
  async pendingArtifactDeletions() { return this.queue.map((storage_key, index) => ({ id: index + 1, storage_key })); }
  async artifactIsReferenced(key) { return this.referenced.has(key); }
  async completeArtifactDeletion(id, status) { this.completed.push([id, status]); }
  async failArtifactDeletion(id, error) { this.failed.push([id, error.message]); }
}

test("dry-run conta candidatos sem tocar fila, nonce ou storage", async () => {
  const repository = new FakeRepository({ candidates: 4, queue: ["nao-deve-ler"] });
  const artifactStore = { delete: async () => assert.fail("storage não pode ser tocado") };
  const result = await runRetention({
    repository,
    artifactStore,
    cutoff: new Date("2026-01-01T00:00:00Z"),
    dryRun: true,
  });

  assert.deepEqual(result, {
    tickets: 4, artifactsQueued: 0, noncesDeleted: 0,
    artifactsDeleted: 0, artifactsRetained: 0, errors: 0,
  });
  assert.equal(repository.purgeCalls[0].dryRun, true);
  assert.deepEqual(repository.completed, []);
});

test("fila bytes sem tocar storage quando a exclusão física não foi autorizada", async () => {
  const repository = new FakeRepository({ candidates: 1, queue: ["queued"] });
  const artifactStore = { delete: async () => assert.fail("storage não pode ser tocado") };
  const result = await runRetention({
    repository,
    artifactStore,
    cutoff: new Date("2026-01-01T00:00:00Z"),
  });

  assert.equal(result.artifactsDeferred, 1);
  assert.equal(result.artifactsDeleted, 0);
  assert.deepEqual(repository.completed, []);
});

test("retém chave compartilhada, exclui órfã e mantém falha na fila", async () => {
  const repository = new FakeRepository({
    candidates: 2,
    queue: ["shared", "deleted", "missing", "failed"],
    referenced: new Set(["shared"]),
  });
  const deleted = [];
  const artifactStore = {
    async delete(key) {
      if (key === "failed") throw new Error("filesystem unavailable");
      deleted.push(key);
      return key === "deleted";
    },
  };

  const result = await runRetention({
    repository,
    artifactStore,
    cutoff: new Date("2026-01-01T00:00:00Z"),
    limit: 10,
    allowArtifactDeletion: true,
  });

  assert.deepEqual(result, {
    tickets: 2, artifactsQueued: 4, noncesDeleted: 3,
    artifactsDeleted: 1, artifactsAbsent: 1, artifactsRetained: 1,
    artifactsDeferred: 0, errors: 1,
  });
  assert.deepEqual(deleted, ["deleted", "missing"]);
  assert.deepEqual(repository.completed, [[1, "retained"], [2, "deleted"], [3, "deleted"]]);
  assert.deepEqual(repository.failed, [[4, "filesystem unavailable"]]);
});
