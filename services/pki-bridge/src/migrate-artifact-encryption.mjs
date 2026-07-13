import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FileArtifactStore } from "./artifact-store.mjs";

async function storageKeys(root) {
  const keys = [];
  for (const prefix of await readdir(root, { withFileTypes: true })) {
    if (!prefix.isDirectory() || !/^[a-f0-9]{2}$/.test(prefix.name)) continue;
    for (const file of await readdir(path.join(root, prefix.name), { withFileTypes: true })) {
      if (file.isFile() && /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(file.name)) {
        keys.push(`sha256/${prefix.name}/${file.name}`);
      }
    }
  }
  return keys.sort();
}

export async function migrateArtifactEncryption({ root, encryptionKey }) {
  const store = new FileArtifactStore(root, { encryptionKey, requireEncryption: false });
  let encrypted = 0;
  const contentRoot = path.join(store.root, "sha256");
  await mkdir(contentRoot, { recursive: true, mode: 0o750 });
  const keys = await storageKeys(contentRoot);
  for (const storageKey of keys) {
    if (await store.encryptLegacy(storageKey)) encrypted += 1;
  }
  return { scanned: keys.length, encrypted };
}

async function main() {
  const root = process.env.ARTIFACT_ROOT;
  const keyFile = process.env.ARTIFACT_ENCRYPTION_KEY_FILE;
  if (!root || !keyFile) throw new Error("artifact migration configuration is incomplete");
  const result = await migrateArtifactEncryption({ root, encryptionKey: await readFile(keyFile) });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
