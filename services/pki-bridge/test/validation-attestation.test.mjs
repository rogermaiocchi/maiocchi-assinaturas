import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  buildValidationAttestationClaims,
  signValidationAttestation,
  verifyValidationAttestation,
} from "../src/validation-attestation.mjs";

const claims = buildValidationAttestationClaims({
  workflowId: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  issuedAt: "2026-07-12T12:01:00.000Z",
  signedPdfSha256: "a".repeat(64),
  validationReportSha256: "b".repeat(64),
  validation: { status: "valid", format: "PAdES" },
});

test("vincula o atestado aos hashes, workflow, revisão e chave confiável", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const compact = signValidationAttestation(claims, { privateKey, keyId: "validator-2026-01" });
  const activeKey = { key: publicKey, status: "active", notBefore: "2026-01-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" };
  const verified = verifyValidationAttestation(compact, claims, new Map([["validator-2026-01", activeKey]]));
  assert.equal(verified.keyId, "validator-2026-01");
  assert.match(verified.sha256, /^[a-f0-9]{64}$/);

  assert.equal(verifyValidationAttestation(compact, { ...claims, revision: 2 }, new Map([["validator-2026-01", activeKey]])), null);
  assert.equal(verifyValidationAttestation(compact, claims, new Map()), null);
  assert.equal(verifyValidationAttestation(compact, claims, new Map([["validator-2026-01", { ...activeKey, status: "retired" }]])), null);
  assert.equal(verifyValidationAttestation(compact, claims, new Map([["validator-2026-01", { ...activeKey, notAfter: "2026-06-01T00:00:00.000Z" }]])), null);

  const parts = compact.split(".");
  parts[0] = Buffer.from(JSON.stringify({ alg: "none", kid: "validator-2026-01" })).toString("base64url");
  assert.equal(verifyValidationAttestation(parts.join("."), claims, new Map([["validator-2026-01", activeKey]])), null);
});
