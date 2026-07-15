import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const REQUEST_PATTERN = /^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/i;
const RESPONSE_PATTERN = /^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})\.([a-f0-9]{64})$/i;

export function bodySha256(rawBody) {
  if (!Buffer.isBuffer(rawBody)) throw new TypeError("rawBody must be a Buffer");
  return createHash("sha256").update(rawBody).digest("hex");
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left || "") || !/^[a-f0-9]{64}$/i.test(right || "")) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function canonicalMethod(value) {
  const method = String(value || "").toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new TypeError("request method is invalid");
  return method;
}

function canonicalTarget(value) {
  const target = String(value || "");
  if (!target.startsWith("/") || target.includes("\n") || target.includes("\r")) {
    throw new TypeError("request target is invalid");
  }
  return target;
}

export function internalRequestMessage({ timestamp, nonce, method, target, requestDigest }) {
  return [timestamp, nonce, canonicalMethod(method), canonicalTarget(target), requestDigest].join("\n");
}

export function verifyInternalRequest({
  header,
  secret,
  rawBody,
  method,
  target,
  now = Math.floor(Date.now() / 1000),
  tolerance = 300,
}) {
  if (typeof header !== "string" || typeof secret !== "string" || secret.length < 32 || !Buffer.isBuffer(rawBody)) return null;
  const match = REQUEST_PATTERN.exec(header);
  if (!match) return null;
  const [, timestamp, nonce, received] = match;
  const numericTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(numericTimestamp) || numericTimestamp <= now - tolerance || numericTimestamp >= now + tolerance) return null;
  const requestDigest = bodySha256(rawBody);
  let expected;
  try {
    expected = createHmac("sha256", secret)
      .update(internalRequestMessage({ timestamp, nonce, method, target, requestDigest }))
      .digest("hex");
  } catch {
    return null;
  }
  if (!safeEqualHex(received, expected)) return null;
  return {
    timestamp,
    nonce: nonce.toLowerCase(),
    method: canonicalMethod(method),
    target: canonicalTarget(target),
    requestDigest,
    expiresAt: new Date((numericTimestamp + tolerance) * 1000),
  };
}

export function signInternalResponse({ secret, requestAuth, status, rawBody, now = Math.floor(Date.now() / 1000) }) {
  if (typeof secret !== "string" || secret.length < 32 || !requestAuth || !Buffer.isBuffer(rawBody)) {
    throw new TypeError("internal response authentication is unavailable");
  }
  const timestamp = String(now);
  const responseDigest = bodySha256(rawBody);
  const message = [timestamp, requestAuth.nonce, requestAuth.requestDigest, String(status), responseDigest].join("\n");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return `${timestamp}.${requestAuth.nonce}.${requestAuth.requestDigest}.${digest}`;
}

export function verifyInternalResponse({
  header,
  secret,
  requestAuth,
  status,
  rawBody,
  now = Math.floor(Date.now() / 1000),
  tolerance = 300,
}) {
  if (typeof header !== "string" || typeof secret !== "string" || secret.length < 32 || !requestAuth || !Buffer.isBuffer(rawBody)) return false;
  const match = RESPONSE_PATTERN.exec(header);
  if (!match) return false;
  const [, timestamp, nonce, requestDigest, received] = match;
  const numericTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(numericTimestamp) || numericTimestamp <= now - tolerance || numericTimestamp >= now + tolerance) return false;
  if (nonce.toLowerCase() !== requestAuth.nonce || requestDigest.toLowerCase() !== requestAuth.requestDigest) return false;
  const responseDigest = bodySha256(rawBody);
  const message = [timestamp, nonce.toLowerCase(), requestDigest.toLowerCase(), String(status), responseDigest].join("\n");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return safeEqualHex(received, expected);
}
