import { constants } from "node:fs";
import { chmod, link, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { sha256Hex } from "./authenticity-contract.mjs";

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;
const STORAGE_KEY_PATTERN = /^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/;
const ENCRYPTED_MAGIC = Buffer.from("MAIENC01", "ascii");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function requireEncryptionKey(value) {
  if (!Buffer.isBuffer(value) || value.length !== 32) {
    throw new TypeError("artifact encryption key must contain exactly 32 bytes");
  }
  return Buffer.from(value);
}

export class FileArtifactStore {
  constructor(root, { encryptionKey = null, requireEncryption = Boolean(encryptionKey) } = {}) {
    if (typeof root !== "string" || root.trim() === "") throw new TypeError("artifact root is required");
    this.root = path.resolve(root);
    this.encryptionKey = encryptionKey ? requireEncryptionKey(encryptionKey) : null;
    this.requireEncryption = Boolean(requireEncryption);
    if (this.requireEncryption && !this.encryptionKey) throw new TypeError("artifact encryption is required but no key was provided");
  }

  get encryptedAtRest() {
    return Boolean(this.encryptionKey && this.requireEncryption);
  }

  isEncrypted(body) {
    return body.length >= ENCRYPTED_MAGIC.length + NONCE_BYTES + TAG_BYTES
      && body.subarray(0, ENCRYPTED_MAGIC.length).equals(ENCRYPTED_MAGIC);
  }

  encode(body, storageKey) {
    if (!this.encryptionKey) return body;
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(storageKey, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
    return Buffer.concat([ENCRYPTED_MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
  }

  decode(stored, storageKey) {
    if (!this.isEncrypted(stored)) {
      if (this.requireEncryption) throw new Error("artifact is not encrypted at rest");
      return stored;
    }
    if (!this.encryptionKey) throw new Error("artifact encryption key is unavailable");
    const nonceStart = ENCRYPTED_MAGIC.length;
    const tagStart = nonceStart + NONCE_BYTES;
    const bodyStart = tagStart + TAG_BYTES;
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, stored.subarray(nonceStart, tagStart), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(storageKey, "utf8"));
    decipher.setAuthTag(stored.subarray(tagStart, bodyStart));
    try {
      return Buffer.concat([decipher.update(stored.subarray(bodyStart)), decipher.final()]);
    } catch {
      throw new Error("artifact authenticated decryption failed");
    }
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
      const existing = this.decode(await readFile(destination), storageKey);
      if (sha256Hex(existing) !== digest) throw new Error("content-addressed artifact was replaced");
      return { storageKey, sha256: digest, size: existing.length };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const temporary = `${destination}.${randomUUID()}.tmp`;
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o440);
    try {
      await handle.writeFile(this.encode(body, storageKey));
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
        const existing = this.decode(await readFile(destination), storageKey);
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
    const bytes = this.decode(await readFile(this.resolve(storageKey)), storageKey);
    const expected = storageKey.match(/^sha256\/[a-f0-9]{2}\/([a-f0-9]{64})\.[a-z0-9]{1,8}$/)?.[1];
    if (!expected || sha256Hex(bytes) !== expected) throw new Error("artifact integrity check failed");
    return bytes;
  }

  async delete(storageKey) {
    try {
      await unlink(this.resolve(storageKey));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async encryptLegacy(storageKey) {
    if (!this.encryptionKey) throw new Error("artifact encryption key is unavailable");
    const destination = this.resolve(storageKey);
    const stored = await readFile(destination);
    if (this.isEncrypted(stored)) {
      this.decode(stored, storageKey);
      return false;
    }
    const expected = storageKey.match(/^sha256\/[a-f0-9]{2}\/([a-f0-9]{64})\.[a-z0-9]{1,8}$/)?.[1];
    if (!expected || sha256Hex(stored) !== expected) throw new Error("legacy artifact integrity check failed");
    const temporary = `${destination}.${randomUUID()}.encrypting`;
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o440);
    try {
      await handle.writeFile(this.encode(stored, storageKey));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, destination);
      await chmod(destination, 0o440);
      return true;
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async metadata(storageKey) {
    const destination = this.resolve(storageKey);
    const [info, stored] = await Promise.all([stat(destination), readFile(destination)]);
    return {
      size: this.decode(stored, storageKey).length,
      immutableMode: (info.mode & 0o777) === 0o440,
      encryptedAtRest: this.isEncrypted(stored),
    };
  }
}
