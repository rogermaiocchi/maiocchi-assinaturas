import { sign, verify } from "node:crypto";
import { canonicalize, sha256Hex } from "./authenticity-contract.mjs";

export const VALIDATION_ATTESTATION_SCHEMA = "urn:maiocchi:validation-attestation:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function requireDigest(value, name) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new TypeError(`${name} is invalid`);
  return value;
}

function requireTimestamp(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new TypeError(`${name} is invalid`);
  return value;
}

export function buildValidationAttestationClaims({ workflowId, revision, issuedAt, signedPdfSha256, validationReportSha256, validation }) {
  if (!UUID_PATTERN.test(workflowId || "")) throw new TypeError("workflow ID is invalid");
  if (!Number.isSafeInteger(revision) || revision <= 0) throw new TypeError("revision is invalid");
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) throw new TypeError("validation summary is invalid");
  return {
    schema: VALIDATION_ATTESTATION_SCHEMA,
    version: "1.0.0",
    workflowId,
    revision,
    issuedAt: requireTimestamp(issuedAt, "attestation issuedAt"),
    signedPdfSha256: requireDigest(signedPdfSha256, "signed PDF SHA-256"),
    validationReportSha256: requireDigest(validationReportSha256, "validation report SHA-256"),
    validation,
  };
}

export function signValidationAttestation(claims, { privateKey, keyId }) {
  if (!KEY_ID_PATTERN.test(keyId || "")) throw new TypeError("validator key ID is invalid");
  const header = { alg: "EdDSA", kid: keyId, typ: "application/vnd.maiocchi.validation+jws" };
  const encodedHeader = base64url(canonicalize(header));
  const encodedPayload = base64url(canonicalize(claims));
  const input = `${encodedHeader}.${encodedPayload}`;
  return `${input}.${base64url(sign(null, Buffer.from(input), privateKey))}`;
}

export function verifyValidationAttestation(compact, expectedClaims, trustedKeys) {
  if (typeof compact !== "string" || !(trustedKeys instanceof Map)) return null;
  const parts = compact.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (header.alg !== "EdDSA" || header.typ !== "application/vnd.maiocchi.validation+jws" || !KEY_ID_PATTERN.test(header.kid || "")) return null;
    if (parts[1] !== base64url(canonicalize(expectedClaims))) return null;
    const trusted = trustedKeys.get(header.kid);
    if (!trusted || trusted.status !== "active") return null;
    const issuedAt = new Date(expectedClaims.issuedAt).getTime();
    const notBefore = new Date(trusted.notBefore).getTime();
    const notAfter = new Date(trusted.notAfter).getTime();
    if (![issuedAt, notBefore, notAfter].every(Number.isFinite) || issuedAt < notBefore || issuedAt > notAfter) return null;
    if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), trusted.key, Buffer.from(parts[2], "base64url"))) return null;
    return { keyId: header.kid, sha256: sha256Hex(compact) };
  } catch {
    return null;
  }
}
