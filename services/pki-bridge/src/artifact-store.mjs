import { constants } from "node:fs";
import { chmod, link, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "./authenticity-contract.mjs";

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;
const STORAGE_KEY_PATTERN = /^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/;

export class FileArtifactStore {
  constructor(root) {
    if (typeof root !== "string" || root.trim() === "") throw new TypeError("artifact root is required");
    this.root = path.resolve(root);
  }

  async put(bytes, { extension }) {
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (body.length === 0) throw new TypeError("artifact must not be empty");
    const suffix = String(extension || "").toLowerCase();
    if (!EXTENSION_PATTERN.test(suffix)) throw new TypeError("artifact extension is invalid");
    const digest = sha256Hex(body);
    const storageKey = `sha256/${digest.slice(0, 2)}/${digest}.${suffix}`;
    const destination = this.resolve(storageKey);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });

    try {
      const existing = await readFile(destination);
      if (sha256Hex(existing) !== digest) throw new Error("content-addressed artifact was replaced");
      return { storageKey, sha256: digest, size: existing.length };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const temporary = `${destination}.${randomUUID()}.tmp`;
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o440);
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      try {
        await link(temporary, destination);
        await chmod(destination, 0o440);
        return { storageKey, sha256: digest, size: body.length };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = await readFile(destination);
        if (sha256Hex(existing) !== digest) throw new Error("content-addressed artifact was replaced");
        return { storageKey, sha256: digest, size: existing.length };
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  resolve(storageKey) {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new TypeError("storage key is invalid");
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new TypeError("storage key escapes the artifact root");
    return resolved;
  }

  async get(storageKey) {
    const bytes = await readFile(this.resolve(storageKey));
    const expected = storageKey.match(/^sha256\/[a-f0-9]{2}\/([a-f0-9]{64})\.[a-z0-9]{1,8}$/)?.[1];
    if (!expected || sha256Hex(bytes) !== expected) throw new Error("artifact integrity check failed");
    return bytes;
  }

  async metadata(storageKey) {
    const info = await stat(this.resolve(storageKey));
    return { size: info.size, immutableMode: (info.mode & 0o777) === 0o440 };
  }
}
