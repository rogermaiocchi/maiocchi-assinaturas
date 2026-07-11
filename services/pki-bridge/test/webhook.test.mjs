import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { completedDocumentUrls, parseSubmissionCompleted, verifyWebhookSignature } from "../src/webhook.mjs";

test("autentica X-Docuseal-Signature com HMAC e janela de cinco minutos", () => {
  const secret = "a".repeat(32);
  const raw = Buffer.from('{"event_type":"submission.completed"}');
  const timestamp = 1_784_000_000;
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
  assert.equal(verifyWebhookSignature(`${timestamp}.${digest}`, secret, raw, { now: timestamp }), true);
  assert.equal(verifyWebhookSignature(`${timestamp}.${"0".repeat(64)}`, secret, raw, { now: timestamp }), false);
  assert.equal(verifyWebhookSignature(`${timestamp}.${digest}`, secret, raw, { now: timestamp + 301 }), false);
  assert.equal(verifyWebhookSignature(`${timestamp}.${digest}`, "curto", raw, { now: timestamp }), false);
});

test("normaliza submission.completed com chave idempotente estável", () => {
  const raw = Buffer.from(JSON.stringify({ event_type: "submission.completed", timestamp: "2026-07-11T12:00:00Z", data: { id: 42 } }));
  const first = parseSubmissionCompleted(raw);
  const second = parseSubmissionCompleted(raw);
  assert.equal(first.submissionId, "42");
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.idempotencyKey.length, 64);
});

test("rejeita evento, JSON e tamanho inválidos", () => {
  assert.throws(() => parseSubmissionCompleted(Buffer.from("{")), /valid JSON/);
  assert.throws(() => parseSubmissionCompleted(Buffer.from('{"event_type":"form.viewed"}')), /unsupported/);
  assert.throws(() => parseSubmissionCompleted(Buffer.alloc(1_048_577)), /body size/);
});

test("aceita documentos concluídos somente no origin DocuSeal configurado", () => {
  const payload = {
    data: {
      combined_document_url: "https://documentos.example.test/file/combined.pdf",
      documents: [
        { url: "https://documentos.example.test/file/one.pdf" },
        { url: "https://documentos.example.test/file/one.pdf" },
      ],
    },
  };
  assert.deepEqual(completedDocumentUrls(payload, "https://documentos.example.test"), [
    "https://documentos.example.test/file/combined.pdf",
    "https://documentos.example.test/file/one.pdf",
  ]);
  assert.throws(() => completedDocumentUrls({ data: { documents: [{ url: "https://external.example.test/file.pdf" }] } }, "https://documentos.example.test"), /disallowed origin/);
});
