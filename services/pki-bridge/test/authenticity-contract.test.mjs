import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  buildAuthenticityRecord,
  canonicalize,
  generatePublicId,
  publicIdFromRegistrationKey,
  signAuthenticityRecord,
  verifyAuthenticityEnvelope,
} from "../src/authenticity-contract.mjs";

const publicId = "MAI-2026-1111-1111-1111-1111";

function recordArgs() {
  return {
    publicId,
    revision: 1,
    originalSha256: "a".repeat(64),
    originalSize: 2048,
    finalizedAt: "2026-07-12T12:00:00.000Z",
    profile: "AD-RT",
    policyOid: "2.16.76.1.7.1.12.2.3",
    signatureCount: 1,
    validatedAt: "2026-07-12T12:01:00.000Z",
    validator: "Validador PAdES homologado",
    validatorKeyId: "validator-2026-01",
    validationAttestationSha256: "d".repeat(64),
    validationReportSha256: "b".repeat(64),
    validationReportSize: 512,
    representationSha256: "c".repeat(64),
    representationSize: 4096,
    disclosureMode: "restricted",
  };
}

function record() {
  return buildAuthenticityRecord(recordArgs());
}

test("gera ID com 80 bits úteis e JSON canônico estável", () => {
  const id = generatePublicId({ year: 2026, randomBytesFn: () => Buffer.alloc(16, 1) });
  assert.equal(id, publicId);
  assert.equal(publicIdFromRegistrationKey("a".repeat(64), { year: 2026 }), "MAI-2026-AAAA-AAAA-AAAA-AAAA");
  assert.equal(canonicalize({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
});

test("assina o registro com Ed25519 e detecta qualquer alteração", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const envelope = signAuthenticityRecord(record(), { privateKey, keyId: "authenticity-2026-01" });
  assert.equal(verifyAuthenticityEnvelope(envelope, publicKey), true);

  const tampered = structuredClone(envelope);
  tampered.record.document.hash.value = "d".repeat(64);
  assert.equal(verifyAuthenticityEnvelope(tampered, publicKey), false);

  const algNone = structuredClone(envelope);
  const parts = algNone.proof.value.split(".");
  parts[0] = Buffer.from(JSON.stringify({ alg: "none", kid: envelope.proof.keyId })).toString("base64url");
  algNone.proof.value = parts.join(".");
  assert.equal(verifyAuthenticityEnvelope(algNone, publicKey), false);
});

test("bloqueia URL insegura e campos fora do contrato", () => {
  assert.throws(() => buildAuthenticityRecord({
    ...recordArgs(),
    baseUrl: "http://assinatura.example",
  }), /HTTPS/i);
  assert.throws(() => generatePublicId({ randomBytesFn: () => Buffer.alloc(15) }), /16 bytes/i);
  assert.throws(() => signAuthenticityRecord(record(), { privateKey: generateKeyPairSync("ed25519").privateKey, keyId: "../invalid" }), /key ID is invalid/i);
});
