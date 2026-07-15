import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { FileArtifactStore } from "./artifact-store.mjs";
import { applyMigrations } from "./authenticity-repository.mjs";
import { PostgresRetentionRepository, runRetention } from "./retention-service.mjs";

function integerEnvironment(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const artifactRoot = process.env.ARTIFACT_ROOT;
  if (!databaseUrl || !artifactRoot) throw new Error("retention configuration is incomplete");
  const days = integerEnvironment("RETENTION_DAYS", 30);
  const queueGraceHours = integerEnvironment("RETENTION_QUEUE_GRACE_HOURS", 24);
  const limit = integerEnvironment("RETENTION_LIMIT", 100);
  const dryRun = process.env.RETENTION_DRY_RUN === "true";
  const allowArtifactDeletion = process.env.RETENTION_ARTIFACT_DELETE_ALLOWED === "true";
  const queueCutoffValue = process.env.RETENTION_QUEUE_CUTOFF;
  const queueCutoff = queueCutoffValue
    ? new Date(queueCutoffValue)
    : new Date(Date.now() - queueGraceHours * 3_600_000);
  if (Number.isNaN(queueCutoff.valueOf())) throw new Error("RETENTION_QUEUE_CUTOFF must be a valid timestamp");
  const pool = new Pool({ connectionString: databaseUrl, max: 2, idleTimeoutMillis: 30_000 });
  try {
    await applyMigrations(pool);
    const result = await runRetention({
      repository: new PostgresRetentionRepository(pool),
      artifactStore: new FileArtifactStore(artifactRoot),
      cutoff: new Date(Date.now() - days * 86_400_000),
      queueCutoff,
      limit,
      dryRun,
      allowArtifactDeletion,
    });
    process.stdout.write(`${JSON.stringify({ event: "pki_retention", dryRun, allowArtifactDeletion, ...result })}\n`);
    if (result.errors > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
