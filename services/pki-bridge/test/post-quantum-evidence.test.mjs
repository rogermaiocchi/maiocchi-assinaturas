import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPostQuantumKeyring,
  createPostQuantumSigner,
  postQuantumKeyId,
} from "../src/post-quantum-evidence.mjs";
import { loadPostQuantumPublicKeys } from "../src/server.mjs";

const supportsMlDsa = Number.parseInt(process.versions.node, 10) >= 24;

test("preserva a verificabilidade ML-DSA-65 depois da rotação", { skip: !supportsMlDsa }, () => {
  const oldPair = generateKeyPairSync("ml-dsa-65");
  const newPair = generateKeyPairSync("ml-dsa-65");
  const oldSigner = createPostQuantumSigner(oldPair.privateKey);
  const newSigner = createPostQuantumSigner(newPair.privateKey);
  const oldManifest = { document: "old", sha256: "a".repeat(64) };
  const newManifest = { document: "new", sha256: "b".repeat(64) };
  const oldAttestation = oldSigner.attest(oldManifest);
  const keyring = createPostQuantumKeyring(newSigner, new Map([[oldSigner.keyId, oldPair.publicKey]]));

  assert.equal(keyring.keyId, newSigner.keyId);
  assert.equal(keyring.verify(oldManifest, oldAttestation), true);
  assert.equal(keyring.verify({ ...oldManifest, document: "changed" }, oldAttestation), false);

  const newAttestation = keyring.attest(newManifest);
  assert.equal(newAttestation.keyId, newSigner.keyId);
  assert.equal(keyring.verify(newManifest, newAttestation), true);
  assert.deepEqual([...keyring.publicKeys.keys()].sort(), [oldSigner.keyId, newSigner.keyId].sort());
});

test("rejeita chave histórica cujo ID não corresponde ao fingerprint", { skip: !supportsMlDsa }, () => {
  const activePair = generateKeyPairSync("ml-dsa-65");
  const historicalPair = generateKeyPairSync("ml-dsa-65");
  const activeSigner = createPostQuantumSigner(activePair.privateKey);

  assert.throws(
    () => createPostQuantumKeyring(activeSigner, new Map([["ml-dsa-65-wrong", historicalPair.publicKey]])),
    /historical post-quantum public key is invalid/,
  );
});

test("carrega somente chaves históricas nomeadas pelo fingerprint", { skip: !supportsMlDsa }, async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "maiocchi-pqc-keyring-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const { publicKey } = generateKeyPairSync("ml-dsa-65");
  const keyId = postQuantumKeyId(publicKey);
  await writeFile(path.join(directory, `${keyId}.pub.pem`), publicKey.export({ type: "spki", format: "pem" }));

  const loaded = await loadPostQuantumPublicKeys(directory);
  assert.deepEqual([...loaded.keys()], [keyId]);

  await writeFile(path.join(directory, "ml-dsa-65-wrong.pub.pem"), publicKey.export({ type: "spki", format: "pem" }));
  await assert.rejects(loadPostQuantumPublicKeys(directory), /does not match its fingerprint/);
});
