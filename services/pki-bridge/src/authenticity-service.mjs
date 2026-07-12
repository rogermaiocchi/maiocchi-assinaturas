import { randomUUID } from "node:crypto";
import {
  authenticityEnvelopeSha256,
  buildAuthenticityRecord,
  canonicalize,
  publicIdFromRegistrationKey,
  sha256Hex,
  signAuthenticityRecord,
} from "./authenticity-contract.mjs";
import { createAuthenticitySheet } from "./print-representation.mjs";
import { buildValidationAttestationClaims, verifyValidationAttestation } from "./validation-attestation.mjs";

function requireIsoTimestamp(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be an ISO-8601 UTC timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError(`${name} must be an ISO-8601 UTC timestamp`);
  }
  return value;
}

export function assertGoldValidation(validation) {
  if (!validation || validation.status !== "valid" || validation.format !== "PAdES" || validation.infrastructure !== "ICP-Brasil") {
    throw new TypeError("a valid PAdES ICP-Brasil inspection is required");
  }
  if (!["AD-RB", "AD-RT"].includes(validation.profile) || !/^\d+(?:\.\d+)+$/.test(validation.policyOid || "")) {
    throw new TypeError("an approved PAdES policy is required");
  }
  if (validation.docMdp !== "valid" || validation.coverage !== "whole-document") {
    throw new TypeError("DocMDP and whole-document coverage must be valid");
  }
  if (!Array.isArray(validation.signatures) || validation.signatures.length === 0) throw new TypeError("at least one valid signature is required");
  for (const [index, signature] of validation.signatures.entries()) {
    if (signature.status !== "valid" || signature.chainStatus !== "valid" || signature.revocationStatus !== "good") {
      throw new TypeError(`signature ${index} did not pass validation`);
    }
    if (!/^[a-f0-9]{64}$/.test(signature.certificateFingerprintSha256 || "")) throw new TypeError(`signature ${index} fingerprint is invalid`);
    requireIsoTimestamp(signature.signingTime, `signature ${index} signingTime`);
    if (validation.profile === "AD-RT") {
      if (signature.timestampStatus !== "valid") throw new TypeError(`signature ${index} timestamp is invalid`);
      requireIsoTimestamp(signature.timestampTime, `signature ${index} timestampTime`);
    }
  }
  requireIsoTimestamp(validation.validatedAt, "validatedAt");
  return true;
}

export async function registerGoldStandardDocument({
  workflowId,
  revision,
  signedPdf,
  validationReport,
  validation,
  validationAttestation,
  finalizedAt,
  disclosureMode = "restricted",
  documentContext,
}, {
  repository,
  artifactStore,
  privateKey,
  keyId,
  validatorKeys,
  allowedPolicyOids = new Set(),
  allowPublicDisclosure = false,
  baseUrl = "https://assinatura.maiocchi.adv.br",
  idFactory = ({ registrationKey, year }) => publicIdFromRegistrationKey(registrationKey, { year }),
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workflowId || "")) throw new TypeError("workflow ID is invalid");
  const pdf = Buffer.isBuffer(signedPdf) ? signedPdf : Buffer.from(signedPdf || "");
  if (pdf.length < 8 || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new TypeError("signed PDF is invalid");
  const report = Buffer.isBuffer(validationReport) ? validationReport : Buffer.from(canonicalize(validationReport));
  if (report.length === 0) throw new TypeError("validation report is required");
  try {
    const parsedReport = JSON.parse(report.toString("utf8"));
    if (!parsedReport || typeof parsedReport !== "object" || Array.isArray(parsedReport)) throw new Error("not an object");
  } catch {
    throw new TypeError("validation report must be a JSON object");
  }
  assertGoldValidation(validation);
  if (!["restricted", "public"].includes(disclosureMode)) throw new TypeError("disclosure mode is invalid");
  const finalTimestamp = requireIsoTimestamp(finalizedAt, "finalizedAt");
  const originalSha256 = sha256Hex(pdf);
  const validationReportSha256 = sha256Hex(report);
  const attestationClaims = buildValidationAttestationClaims({
    workflowId,
    revision,
    issuedAt: validation.validatedAt,
    signedPdfSha256: originalSha256,
    validationReportSha256,
    validation,
  });
  if (typeof validationAttestation !== "string" || validationAttestation.split(".").length !== 3) {
    throw new TypeError("validation attestation is invalid");
  }
  const validationAttestationSha256 = sha256Hex(validationAttestation);
  const registrationKey = sha256Hex(canonicalize({
    workflowId,
    revision,
    originalSha256,
    validationReportSha256,
    validationAttestationSha256,
    finalizedAt: finalTimestamp,
    disclosureMode,
    documentContext: documentContext || {},
  }));
  const existing = await repository.findByWorkflowId(workflowId);
  if (existing) {
    if (existing.registration_key !== registrationKey) {
      throw Object.assign(new Error("workflow already has a different authenticity record"), { status: 409 });
    }
    return {
      documentId: existing.document_id,
      recordId: existing.record_id,
      publicId: existing.public_id,
      envelope: existing.envelope,
      replayed: true,
      operationId: randomUUID(),
    };
  }
  if (!(allowedPolicyOids instanceof Set) || !allowedPolicyOids.has(validation.policyOid)) {
    throw new TypeError("PAdES policy OID is not authorized");
  }
  if (disclosureMode === "public" && !allowPublicDisclosure) throw new TypeError("public original disclosure is disabled");
  const attestation = verifyValidationAttestation(validationAttestation, attestationClaims, validatorKeys);
  if (!attestation || attestation.sha256 !== validationAttestationSha256) throw new TypeError("a trusted validation attestation is required");
  const attestationBytes = Buffer.from(validationAttestation);
  const publicId = idFactory({ registrationKey, year: new Date(finalTimestamp).getUTCFullYear() });
  const verifyUrl = new URL(`/v/${publicId}`, baseUrl).toString();

  const representation = await createAuthenticitySheet({
    publicId,
    originalSha256,
    revision,
    finalizedAt: finalTimestamp,
    verifyUrl,
    documentContext,
    signatures: validation.signatures,
    signatureType: `PAdES ${validation.profile} - ICP-Brasil`,
  });
  const representationSha256 = sha256Hex(representation);
  const record = buildAuthenticityRecord({
    publicId,
    revision,
    originalSha256,
    originalSize: pdf.length,
    finalizedAt: finalTimestamp,
    profile: validation.profile,
    policyOid: validation.policyOid,
    signatureCount: validation.signatures.length,
    signatures: validation.signatures,
    validatedAt: validation.validatedAt,
    validator: validation.validator,
    validatorKeyId: attestation.keyId,
    validationAttestationSha256: attestation.sha256,
    validationReportSha256,
    validationReportSize: report.length,
    representationSha256,
    representationSize: representation.length,
    disclosureMode,
    documentContext,
    baseUrl,
  });
  const envelope = signAuthenticityRecord(record, { privateKey, keyId });
  const envelopeBytes = Buffer.from(canonicalize(envelope));
  const envelopeSha256 = authenticityEnvelopeSha256(envelope);
  const artifacts = {
    original: await artifactStore.put(pdf, { extension: "pdf" }),
    validationReport: await artifactStore.put(report, { extension: "json" }),
    validationAttestation: await artifactStore.put(attestationBytes, { extension: "jws" }),
    representation: await artifactStore.put(representation, { extension: "pdf" }),
    envelope: await artifactStore.put(envelopeBytes, { extension: "json" }),
  };
  if (artifacts.original.sha256 !== originalSha256 || artifacts.representation.sha256 !== representationSha256) {
    throw new Error("artifact storage changed the registered bytes");
  }
  if (artifacts.validationAttestation.sha256 !== attestation.sha256) throw new Error("validation attestation changed during storage");

  const signatures = validation.signatures.map((signature, index) => ({
    index,
    certificateFingerprintSha256: signature.certificateFingerprintSha256,
    signingTime: signature.signingTime,
    timestampTime: signature.timestampTime || null,
  }));
  const persisted = await repository.saveRecord({ workflowId, registrationKey, envelope, envelopeSha256, validationAttestation, artifacts, signatures });
  if (persisted.replayed) return { ...persisted, operationId: randomUUID() };
  return { ...persisted, envelope, envelopeSha256, artifacts, operationId: randomUUID() };
}
