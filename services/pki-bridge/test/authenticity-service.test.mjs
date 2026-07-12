import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import test from "node:test";
import { FileArtifactStore } from "../src/artifact-store.mjs";
import { canonicalize, sha256Hex, verifyAuthenticityEnvelope } from "../src/authenticity-contract.mjs";
import { assertGoldValidation, registerGoldStandardDocument } from "../src/authenticity-service.mjs";
import { buildValidationAttestationClaims, signValidationAttestation } from "../src/validation-attestation.mjs";

const validation = {
  status: "valid",
  format: "PAdES",
  infrastructure: "ICP-Brasil",
  profile: "AD-RT",
  policyOid: "2.16.76.1.7.1.12.2.3",
  docMdp: "valid",
  coverage: "whole-document",
  validatedAt: "2026-07-12T12:01:00.000Z",
  validator: "Adapter de validação PAdES",
  signatures: [{
    status: "valid",
    chainStatus: "valid",
    revocationStatus: "good",
    certificateFingerprintSha256: "a".repeat(64),
    signerName: "Assinante ICP Teste",
    signingTime: "2026-07-12T12:00:00.000Z",
    timestampStatus: "valid",
    timestampTime: "2026-07-12T12:00:30.000Z",
  }],
};
const allowedPolicyOids = new Set([validation.policyOid]);

async function fixturePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  return Buffer.from(await pdf.save());
}

test("registra somente resultado PAdES validado e preserva o PDF final", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maiocchi-gold-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const artifactStore = new FileArtifactStore(root);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signedPdf = await fixturePdf();
  const validationReport = { engine: "fixture", result: validation };
  const { privateKey: validatorPrivateKey, publicKey: validatorPublicKey } = generateKeyPairSync("ed25519");
  const validationAttestation = signValidationAttestation(buildValidationAttestationClaims({
    workflowId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    issuedAt: validation.validatedAt,
    signedPdfSha256: sha256Hex(signedPdf),
    validationReportSha256: sha256Hex(canonicalize(validationReport)),
    validation,
  }), { privateKey: validatorPrivateKey, keyId: "validator-2026-01" });
  let persisted;
  let existing = null;
  let saveCount = 0;
  const repository = {
    async findByWorkflowId(workflowId) { return existing?.workflow_id === workflowId ? existing : null; },
    async saveRecord(value) {
      saveCount += 1;
      persisted = value;
      existing = {
        document_id: "document-uuid",
        record_id: "record-uuid",
        workflow_id: value.workflowId,
        public_id: value.envelope.record.document.id,
        registration_key: value.registrationKey,
        envelope: value.envelope,
      };
      return { documentId: "document-uuid", recordId: "record-uuid", publicId: value.envelope.record.document.id, replayed: false };
    },
  };

  const result = await registerGoldStandardDocument({
    workflowId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:45.000Z",
    disclosureMode: "restricted",
  }, {
    repository,
    artifactStore,
    privateKey,
    keyId: "authenticity-2026-01",
    allowedPolicyOids,
    validatorKeys: new Map([["validator-2026-01", {
      key: validatorPublicKey,
      status: "active",
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
    }]]),
    idFactory: () => "MAI-2026-1111-1111-1111-1111",
  });

  assert.equal(result.envelope.record.document.hash.value, sha256Hex(signedPdf));
  assert.equal(result.envelope.record.links.original, null);
  assert.equal(verifyAuthenticityEnvelope(result.envelope, publicKey), true);
  assert.deepEqual(await artifactStore.get(persisted.artifacts.original.storageKey), signedPdf);
  assert.notEqual(persisted.artifacts.original.sha256, persisted.artifacts.representation.sha256);
  assert.equal(result.envelope.record.validation.attestation.keyId, "validator-2026-01");
  assert.equal(result.envelope.record.goldStandard.signers[0].name, "Assinante ICP Teste");
  assert.equal(result.envelope.record.goldStandard.barcodeValue, "MAI|MAI-2026-1111-1111-1111-1111|R1");
  assert.equal(persisted.artifacts.validationAttestation.sha256, result.envelope.record.validation.attestation.hash.value);

  const replay = await registerGoldStandardDocument({
    workflowId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:45.000Z",
    disclosureMode: "restricted",
  }, {
    repository,
    artifactStore,
    privateKey,
    keyId: "authenticity-2026-01",
    allowedPolicyOids,
    validatorKeys: new Map([["validator-2026-01", {
      key: validatorPublicKey,
      status: "active",
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
    }]]),
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.publicId, result.publicId);
  assert.equal(saveCount, 1);

  await assert.rejects(registerGoldStandardDocument({
    workflowId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:46.000Z",
  }, {
    repository,
    artifactStore,
    privateKey,
    keyId: "authenticity-2026-01",
    allowedPolicyOids,
    validatorKeys: new Map([["validator-2026-01", {
      key: validatorPublicKey,
      status: "active",
      notBefore: "2026-01-01T00:00:00.000Z",
      notAfter: "2027-01-01T00:00:00.000Z",
    }]]),
  }), (error) => error.status === 409);

  await assert.rejects(registerGoldStandardDocument({
    workflowId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:45.000Z",
  }, {
    repository,
    artifactStore,
    privateKey,
    keyId: "authenticity-2026-01",
    allowedPolicyOids,
    validatorKeys: new Map(),
  }), /trusted validation attestation/i);

  await assert.rejects(registerGoldStandardDocument({
    workflowId: "33333333-3333-4333-8333-333333333333",
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:45.000Z",
  }, {
    repository,
    artifactStore,
    privateKey,
    keyId: "authenticity-2026-01",
    allowedPolicyOids: new Set(),
    validatorKeys: new Map(),
  }), /policy OID is not authorized/i);

  await assert.rejects(registerGoldStandardDocument({
    workflowId: "44444444-4444-4444-8444-444444444444",
    revision: 1,
    signedPdf,
    validationReport,
    validation,
    validationAttestation,
    finalizedAt: "2026-07-12T12:00:45.000Z",
    disclosureMode: "public",
  }, {
    repository,
    artifactStore,
    privateKey,
    keyId: "authenticity-2026-01",
    allowedPolicyOids,
    validatorKeys: new Map(),
  }), /public original disclosure is disabled/i);
});

test("falha fechado quando cadeia, cobertura, tempo ou perfil não passam", () => {
  assert.throws(() => assertGoldValidation({ ...validation, coverage: "partial" }), /whole-document/i);
  assert.throws(() => assertGoldValidation({ ...validation, profile: "AD-RB", signatures: [{ ...validation.signatures[0], chainStatus: "unknown" }] }), /did not pass/i);
  assert.throws(() => assertGoldValidation({ ...validation, validatedAt: "data-inválida" }), /ISO-8601/i);
  assert.throws(() => assertGoldValidation({ ...validation, signatures: [{ ...validation.signatures[0], timestampStatus: "unknown" }] }), /timestamp is invalid/i);
});
