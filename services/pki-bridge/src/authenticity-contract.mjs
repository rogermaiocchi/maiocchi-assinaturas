import { createHash, randomBytes, sign, verify } from "node:crypto";

export const AUTHENTICITY_SCHEMA = "https://assinatura.maiocchi.adv.br/schemas/authenticity-key-v1.schema.json";
export const AUTHENTICITY_VERSION = "1.1.0";
export const OFFICIAL_VALIDATOR_URL = "https://validar.iti.gov.br/";

const PUBLIC_ID_PATTERN = /^MAI-\d{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const POLICY_OID_PATTERN = /^\d+(?:\.\d+)+$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PADES_PROFILES = new Set(["AD-RB", "AD-RT"]);
const DISCLOSURE_MODES = new Set(["restricted", "public"]);

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function requireTimestamp(value, name) {
  const text = requireString(value, name);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new TypeError(`${name} must be an ISO-8601 UTC timestamp`);
  }
  return text;
}

function requireSha256(value, name) {
  const digest = requireString(value, name).toLowerCase();
  if (!SHA256_PATTERN.test(digest)) throw new TypeError(`${name} must be a lowercase SHA-256 digest`);
  return digest;
}

function requireHttpsUrl(value, name) {
  const url = new URL(requireString(value, name));
  if (url.protocol !== "https:" || url.username || url.password) throw new TypeError(`${name} must use HTTPS`);
  return url.toString();
}

function requireKeyId(value, name) {
  const keyId = requireString(value, name);
  if (!KEY_ID_PATTERN.test(keyId)) throw new TypeError(`${name} is invalid`);
  return keyId;
}

function optionalDisplay(value, name, fallback, maxLength = 180) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = requireString(value, name).replace(/\s+/g, " ");
  if (normalized.length > maxLength) throw new TypeError(`${name} is too long`);
  return normalized;
}

function normalizeGoldMetadata(value, { publicId, revision, profile, signatures }) {
  if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value))) {
    throw new TypeError("document context is invalid");
  }
  const context = value || {};
  const contextSigners = Array.isArray(context.signers) ? context.signers : [];
  if (context.signers !== undefined && !Array.isArray(context.signers)) throw new TypeError("document context signers are invalid");
  if (contextSigners.length > 12) throw new TypeError("document context has too many signers");
  if (contextSigners.length > signatures.length) throw new TypeError("document context has more signers than validated signatures");
  const signers = signatures.map((signature, index) => {
    const declared = contextSigners[index];
    if (declared !== undefined && (declared === null || typeof declared !== "object" || Array.isArray(declared))) {
      throw new TypeError(`signer ${index} is invalid`);
    }
    return {
      name: optionalDisplay(declared?.name ?? signature.signerName, `signer ${index} name`, "Não informado", 140),
      role: optionalDisplay(declared?.role, `signer ${index} role`, "Signatário", 80),
      certificateFingerprintSha256: requireSha256(signature.certificateFingerprintSha256, `signer ${index} certificate fingerprint`),
      signedAt: requireTimestamp(signature.signingTime, `signer ${index} signing time`),
    };
  });
  return {
    barcodeValue: `MAI|${publicId}|R${revision}`,
    intendedFor: optionalDisplay(context.intendedFor, "intended for", "Não informado"),
    purpose: optionalDisplay(context.purpose, "document purpose", "Documento eletrônico"),
    signingLocation: optionalDisplay(context.signingLocation, "signing location", "Não informado"),
    tokenType: optionalDisplay(context.tokenType, "token type", "Não informado", 100),
    signatureType: `PAdES ${profile} - ICP-Brasil`,
    signers,
  };
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function canonicalValue(value, path = "$") {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item, index) => canonicalValue(item, `${path}[${index}]`)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => {
      if (item === undefined) throw new TypeError(`${path}.${key} is undefined`);
      return `${JSON.stringify(key)}:${canonicalValue(item, `${path}.${key}`)}`;
    }).join(",")}}`;
  }
  throw new TypeError(`${path} contains an unsupported value`);
}

export function canonicalize(value) {
  return canonicalValue(value);
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePublicId(value) {
  return requireString(value, "document ID").toUpperCase();
}

export function assertPublicId(value) {
  const publicId = normalizePublicId(value);
  if (!PUBLIC_ID_PATTERN.test(publicId)) throw new TypeError("document ID has an invalid format");
  return publicId;
}

export function generatePublicId({ year = new Date().getUTCFullYear(), randomBytesFn = randomBytes } = {}) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new TypeError("year is invalid");
  const entropy = randomBytesFn(16);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 16) throw new TypeError("random source must return 16 bytes");
  const symbols = [...entropy].map((byte) => CROCKFORD[byte & 31]).join("");
  return `MAI-${year}-${symbols.match(/.{4}/g).join("-")}`;
}

export function publicIdFromRegistrationKey(registrationKey, { year = new Date().getUTCFullYear() } = {}) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new TypeError("year is invalid");
  const digest = requireSha256(registrationKey, "registration key");
  const symbols = [...Buffer.from(digest, "hex").subarray(0, 16)].map((byte) => CROCKFORD[byte & 31]).join("");
  return `MAI-${year}-${symbols.match(/.{4}/g).join("-")}`;
}

export function buildAuthenticityRecord({
  publicId,
  revision,
  originalSha256,
  originalSize,
  finalizedAt,
  profile,
  policyOid,
  signatureCount,
  signatures,
  validatedAt,
  validator,
  validatorKeyId,
  validationAttestationSha256,
  validationReportSha256,
  validationReportSize,
  representationSha256,
  representationSize,
  disclosureMode = "restricted",
  documentContext,
  baseUrl = "https://assinatura.maiocchi.adv.br",
}) {
  const id = assertPublicId(publicId);
  const normalizedProfile = requireString(profile, "PAdES profile").toUpperCase();
  if (!PADES_PROFILES.has(normalizedProfile)) throw new TypeError("PAdES profile must be AD-RB or AD-RT");
  const normalizedPolicyOid = requireString(policyOid, "policy OID");
  if (!POLICY_OID_PATTERN.test(normalizedPolicyOid)) throw new TypeError("policy OID is invalid");
  if (!DISCLOSURE_MODES.has(disclosureMode)) throw new TypeError("disclosure mode is invalid");

  const origin = new URL(requireHttpsUrl(baseUrl, "portal base URL"));
  const verifyUrl = new URL(`/v/${id}`, origin).toString();
  const originalUrl = disclosureMode === "public" ? new URL(`/original/${id}.pdf`, origin).toString() : null;
  const normalizedSignatures = Array.isArray(signatures) ? signatures : [];
  if (normalizedSignatures.length !== signatureCount) throw new TypeError("signature metadata count is invalid");
  const goldStandard = normalizeGoldMetadata(documentContext, {
    publicId: id,
    revision,
    profile: normalizedProfile,
    signatures: normalizedSignatures,
  });

  return {
    schema: AUTHENTICITY_SCHEMA,
    version: AUTHENTICITY_VERSION,
    document: {
      id,
      revision: requirePositiveInteger(revision, "document revision"),
      mediaType: "application/pdf",
      size: requirePositiveInteger(originalSize, "original size"),
      hash: { algorithm: "SHA-256", value: requireSha256(originalSha256, "original SHA-256") },
      finalizedAt: requireTimestamp(finalizedAt, "finalizedAt"),
    },
    signature: {
      format: "PAdES",
      infrastructure: "ICP-Brasil",
      profile: normalizedProfile,
      policyOid: normalizedPolicyOid,
      count: requirePositiveInteger(signatureCount, "signature count"),
      docMdp: "valid",
    },
    validation: {
      status: "valid",
      validatedAt: requireTimestamp(validatedAt, "validatedAt"),
      validator: requireString(validator, "validator"),
      attestation: {
        type: "JWS",
        algorithm: "EdDSA",
        keyId: requireKeyId(validatorKeyId, "validator key ID"),
        hash: { algorithm: "SHA-256", value: requireSha256(validationAttestationSha256, "validation attestation SHA-256") },
      },
      report: {
        mediaType: "application/json",
        size: requirePositiveInteger(validationReportSize, "validation report size"),
        hash: { algorithm: "SHA-256", value: requireSha256(validationReportSha256, "validation report SHA-256") },
      },
    },
    representation: {
      type: "authenticity-sheet",
      mediaType: "application/pdf",
      size: requirePositiveInteger(representationSize, "representation size"),
      hash: { algorithm: "SHA-256", value: requireSha256(representationSha256, "representation SHA-256") },
    },
    goldStandard,
    disclosure: { mode: disclosureMode },
    links: {
      verify: verifyUrl,
      original: originalUrl,
      print: new URL(`/folha/${id}.pdf`, origin).toString(),
      officialValidator: OFFICIAL_VALIDATOR_URL,
    },
  };
}

export function signAuthenticityRecord(record, { privateKey, keyId }) {
  const kid = requireKeyId(keyId, "signing key ID");
  const protectedHeader = { alg: "EdDSA", kid, typ: "application/vnd.maiocchi.authenticity+jws" };
  const encodedHeader = base64url(canonicalize(protectedHeader));
  const encodedPayload = base64url(canonicalize(record));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey);
  return {
    record,
    proof: {
      type: "JWS",
      algorithm: "EdDSA",
      keyId: kid,
      value: `${signingInput}.${base64url(signature)}`,
    },
  };
}

export function verifyAuthenticityEnvelope(envelope, publicKey) {
  if (!envelope?.record || envelope?.proof?.type !== "JWS" || envelope.proof.algorithm !== "EdDSA") return false;
  const compact = envelope.proof.value;
  if (typeof compact !== "string") return false;
  const parts = compact.split(".");
  if (parts.length !== 3) return false;
  try {
    const expectedPayload = base64url(canonicalize(envelope.record));
    if (parts[1] !== expectedPayload) return false;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (header.alg !== "EdDSA" || header.typ !== "application/vnd.maiocchi.authenticity+jws" || header.kid !== envelope.proof.keyId) return false;
    return verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"));
  } catch {
    return false;
  }
}

export function authenticityEnvelopeSha256(envelope) {
  return sha256Hex(canonicalize(envelope));
}
