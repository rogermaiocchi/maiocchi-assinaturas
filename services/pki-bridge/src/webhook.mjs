import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(header, secret, rawBody, { now = Math.floor(Date.now() / 1000), tolerance = 300 } = {}) {
  if (typeof header !== "string" || typeof secret !== "string" || secret.length < 32 || !Buffer.isBuffer(rawBody)) return false;
  const separator = header.indexOf(".");
  if (separator < 1) return false;
  const timestampText = header.slice(0, separator);
  const signature = header.slice(separator + 1);
  if (!/^\d+$/.test(timestampText) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || timestamp < now - tolerance || timestamp > now + tolerance) return false;
  const expected = createHmac("sha256", secret).update(timestampText).update(".").update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

export function webhookIdempotencyKey(rawBody) {
  if (!Buffer.isBuffer(rawBody)) throw new TypeError("rawBody must be a Buffer");
  return createHash("sha256").update(rawBody).digest("hex");
}

export function parseSubmissionCompleted(rawBody) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > 1_048_576) {
    throw new TypeError("invalid webhook body size");
  }
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new TypeError("webhook body must be valid JSON");
  }
  if (payload?.event_type !== "submission.completed") throw new TypeError("unsupported webhook event");
  const submissionId = payload?.data?.id;
  if ((!Number.isInteger(submissionId) && typeof submissionId !== "string") || String(submissionId).trim() === "") {
    throw new TypeError("submission id is required");
  }
  return {
    eventType: payload.event_type,
    submissionId: String(submissionId),
    occurredAt: typeof payload.timestamp === "string" ? payload.timestamp : null,
    idempotencyKey: webhookIdempotencyKey(rawBody),
    payload,
  };
}

export function completedDocumentUrls(payload, documentsBaseUrl) {
  const base = new URL(documentsBaseUrl);
  if (base.protocol !== "https:") throw new TypeError("DocuSeal base URL must use HTTPS");
  const values = [payload?.data?.combined_document_url, ...(payload?.data?.documents || []).map((item) => item?.url)];
  return [...new Set(values.filter((value) => typeof value === "string").map((value) => {
    const url = new URL(value);
    if (url.origin !== base.origin || url.username || url.password) throw new TypeError("document URL has a disallowed origin");
    return url.toString();
  }))];
}
