import assert from "node:assert/strict";
import test from "node:test";
import { PrivatePadesProviderClient } from "../src/private-pades-provider-client.mjs";

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("cliente do provider prepara e conclui somente resultado confiável", async () => {
  const calls = [];
  const signed = Buffer.from("%PDF-signed");
  const signingTask = {
    sessionId: "11111111-1111-4111-8111-111111111111", toBeSignedBase64: "ZHRicw==",
    digestAlgorithm: "SHA-256", signatureAlgorithm: "RSA-SHA256", documentSha256: "a".repeat(64),
    certificateFingerprintSha256: "b".repeat(64), expiresAt: "2026-07-12T18:00:00Z",
  };
  const client = new PrivatePadesProviderClient({
    endpoint: "http://pades-provider:3500", apiKey: "provider-test-credential-with-32-chars", allowInsecureInternal: true,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), key: init.headers["x-provider-key"], body: JSON.parse(init.body) });
      if (String(url).endsWith("/prepare")) return response(signingTask, 201);
      if (String(url).endsWith("/resume")) return response(signingTask);
      return response({ signedPdfBase64: signed.toString("base64"), signedPdfSha256: "c".repeat(64),
        validation: { trusted: true, cryptographicIntegrity: true } });
    },
  });
  const task = await client.prepare({ pdf: Buffer.from("%PDF-test"), certificateBase64: "cert" });
  const resumed = await client.resume({ sessionId: task.sessionId });
  const result = await client.complete({ sessionId: task.sessionId, signatureBase64: "signature" });
  assert.deepEqual(resumed, task);
  assert.deepEqual(result.pdf, signed);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.key.length >= 32));
});

test("cliente rejeita HTTP externo e resultado sem validação", async () => {
  assert.throws(() => new PrivatePadesProviderClient({
    endpoint: "http://provider.example", apiKey: "provider-test-credential-with-32-chars",
  }), /HTTPS/);
  const client = new PrivatePadesProviderClient({
    endpoint: "https://provider.example", apiKey: "provider-test-credential-with-32-chars",
    fetchImpl: async () => response({ signedPdfBase64: "cGRm", signedPdfSha256: "a".repeat(64), validation: { trusted: false } }),
  });
  await assert.rejects(() => client.complete({ sessionId: "id", signatureBase64: "sig" }), /trusted signed PDF/i);
});
