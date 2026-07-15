import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { canonicalize } from "./authenticity-contract.mjs";

const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function crockford(value) {
  let bits = "";
  for (const byte of value) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += CROCKFORD[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

export function postQuantumKeyId(publicKey) {
  const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
  if (key.asymmetricKeyType !== "ml-dsa-65") throw new TypeError("post-quantum key must be ML-DSA-65");
  const fingerprint = sha256(key.export({ type: "spki", format: "der" })).toString("hex").slice(0, 16);
  return `ml-dsa-65-${fingerprint}`;
}

export function createPostQuantumSigner(privateKey, configuredKeyId) {
  if (privateKey?.asymmetricKeyType !== "ml-dsa-65") throw new TypeError("post-quantum private key must be ML-DSA-65");
  const publicKey = createPublicKey(privateKey);
  const derivedKeyId = postQuantumKeyId(publicKey);
  if (configuredKeyId && configuredKeyId !== derivedKeyId) {
    throw new TypeError("configured post-quantum key ID does not match its public key fingerprint");
  }
  const keyId = derivedKeyId;
  if (!KEY_ID_PATTERN.test(keyId)) throw new TypeError("post-quantum key ID is invalid");
  return {
    keyId,
    publicKey,
    attest(manifest) {
      const payload = Buffer.from(canonicalize(manifest), "utf8");
      const signature = sign(null, payload, privateKey);
      const compactCode = crockford(sha256(signature).subarray(0, 10));
      return {
        schema: "https://assinatura.maiocchi.adv.br/schemas/pades-evidence-attestation-v1.json",
        version: "1.0.0",
        algorithm: "ML-DSA-65",
        keyId,
        manifestSha256: sha256(payload).toString("hex"),
        code: `PQC-MLDSA65-${compactCode.match(/.{1,4}/g).join("-")}`,
        signatureBase64url: signature.toString("base64url"),
      };
    },
    verify(manifest, attestation) {
      return verifyPostQuantumAttestation(manifest, attestation, publicKey);
    },
  };
}

export function createPostQuantumKeyring(activeSigner, historicalPublicKeys = new Map()) {
  if (!activeSigner?.attest || !activeSigner?.keyId || !activeSigner?.publicKey) {
    throw new TypeError("active post-quantum signer is invalid");
  }
  const publicKeys = new Map(historicalPublicKeys);
  for (const [keyId, publicKey] of publicKeys) {
    if (!KEY_ID_PATTERN.test(keyId) || postQuantumKeyId(publicKey) !== keyId) {
      throw new TypeError("historical post-quantum public key is invalid");
    }
  }
  publicKeys.set(activeSigner.keyId, activeSigner.publicKey);
  return {
    keyId: activeSigner.keyId,
    publicKey: activeSigner.publicKey,
    publicKeys,
    attest(manifest) {
      return activeSigner.attest(manifest);
    },
    verify(manifest, attestation) {
      const publicKey = publicKeys.get(attestation?.keyId);
      return Boolean(publicKey && verifyPostQuantumAttestation(manifest, attestation, publicKey));
    },
  };
}

export function verifyPostQuantumAttestation(manifest, attestation, publicKey) {
  if (attestation?.algorithm !== "ML-DSA-65" || typeof attestation.signatureBase64url !== "string") return false;
  try {
    const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "ml-dsa-65" || postQuantumKeyId(key) !== attestation.keyId) return false;
    const payload = Buffer.from(canonicalize(manifest), "utf8");
    if (sha256(payload).toString("hex") !== attestation.manifestSha256) return false;
    const signature = Buffer.from(attestation.signatureBase64url, "base64url");
    const compactCode = crockford(sha256(signature).subarray(0, 10));
    if (`PQC-MLDSA65-${compactCode.match(/.{1,4}/g).join("-")}` !== attestation.code) return false;
    return verify(null, payload, key, signature);
  } catch {
    return false;
  }
}
