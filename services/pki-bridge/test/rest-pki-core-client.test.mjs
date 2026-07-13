import assert from "node:assert/strict";
import test from "node:test";
import { PkiConfigurationError, PkiProviderError } from "../src/errors.mjs";
import { RestPkiCoreClient, sha256Base64 } from "../src/rest-pki-core-client.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function clientWith(fetchImpl) {
  return new RestPkiCoreClient({
    endpoint: "https://pki.example.test",
    apiKey: "credential",
    securityContextId: "11111111-1111-4111-8111-111111111111",
    fetchImpl,
  });
}

test("falha fechado sem configuração obrigatória ou HTTPS", () => {
  assert.throws(() => new RestPkiCoreClient({}), PkiConfigurationError);
  assert.throws(() => new RestPkiCoreClient({ endpoint: "http://pki.example.test", apiKey: "credential", securityContextId: "11111111-1111-4111-8111-111111111111" }), /HTTPS/);
  assert.throws(() => new RestPkiCoreClient({ endpoint: "https://pki.example.test", apiKey: "credential", securityContextId: "context" }), /UUID/);
});

test("prepara PAdES conforme o contrato oficial sem expor credencial", async () => {
  let request;
  const client = clientWith(async (url, options) => {
    request = { url: String(url), options, body: JSON.parse(options.body) };
    return jsonResponse({ success: true, state: "opaque-state", toSignHash: { value: "digest", algorithm: "SHA256" } });
  });
  const result = await client.preparePdfSignature({ pdf: Buffer.from("pdf"), name: "contrato.pdf", certificate: "certificate" });
  assert.equal(result.state, "opaque-state");
  assert.equal(request.url, "https://pki.example.test/api/signature");
  assert.equal(request.body.signatureType, "Pdf");
  assert.equal(request.body.file.mimeType, "application/pdf");
  assert.equal(request.options.headers["x-api-key"], "credential");
});

test("conclui, calcula hash e inspeciona o PDF assinado", async () => {
  const signed = Buffer.from("signed-pdf");
  const calls = [];
  const client = clientWith(async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    if (String(url).endsWith("/api/signature/completion")) {
      return jsonResponse({ signedFile: { content: signed.toString("base64"), name: "final.pdf" } });
    }
    return jsonResponse({ success: true, signers: [{ validationResults: { passed: true } }] });
  });
  const complete = await client.completePdfSignature({ state: "opaque", signature: "signed-bytes" });
  assert.deepEqual(complete.pdf, signed);
  assert.equal(complete.sha256, sha256Base64(signed));
  const inspection = await client.inspectPdf(signed);
  assert.equal(inspection.signers.length, 1);
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ["https://pki.example.test/api/signature/completion", "POST"],
    ["https://pki.example.test/api/signature-inspection", "PUT"],
  ]);
});

test("sanitiza falhas do provider e bloqueia URL temporária externa", async () => {
  const client = clientWith(async () => jsonResponse({ code: "Unauthorized" }, 401));
  await assert.rejects(() => client.inspectPdf(Buffer.from("pdf")), (error) => {
    assert.ok(error instanceof PkiProviderError);
    assert.equal(error.status, 401);
    assert.doesNotMatch(error.message, /credential/);
    return true;
  });
  await assert.rejects(() => client.downloadTemporaryFile("https://external.example.test/final.pdf"), /disallowed/);
  await assert.rejects(() => client.downloadTemporaryFile("https://pki.example.test:444/final.pdf"), /disallowed/);
  const oversized = clientWith(async () => new Response("", { status: 200, headers: { "content-length": String(41 * 1024 * 1024) } }));
  await assert.rejects(() => oversized.downloadTemporaryFile("https://pki.example.test/final.pdf"), /size limit/);
});

test("cria e conclui sessão remota com certificado em nuvem", async () => {
  const signed = Buffer.from("%PDF-1.7\nsigned");
  const calls = [];
  const client = clientWith(async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith("/api/signature-sessions")) {
      return jsonResponse({
        sessionId: "77777777-7777-4777-8777-777777777777",
        redirectUrl: "https://pki.example.test/signature-session/authorize",
      });
    }
    if (String(url).includes("/api/signature-sessions/")) {
      return jsonResponse({
        id: "77777777-7777-4777-8777-777777777777", status: "Completed", callbackArgument: "ticket-id",
        documents: [{ signedFile: { content: signed.toString("base64"), name: "final.pdf" } }],
      });
    }
    throw new Error("unexpected request");
  });
  const created = await client.createSignatureSession({
    pdf: Buffer.from("%PDF-source"), name: "contrato.pdf",
    returnUrl: "https://assinatura.example.test/assinar-icp/", callbackArgument: "ticket-id",
  });
  assert.equal(created.sessionId, "77777777-7777-4777-8777-777777777777");
  assert.equal(calls[0].body.disableDownloads, true);
  assert.equal(calls[0].body.documents[0].signatureType, "Pdf");
  assert.deepEqual(calls[0].body.certificateRequirements, [{ type: "CryptoDevice" }]);
  const session = await client.getSignatureSession(created.sessionId);
  assert.deepEqual((await client.signedPdfFromSession(session)).pdf, signed);
});

test("bloqueia retorno inseguro e sessão remota incompleta", async () => {
  const client = clientWith(async () => jsonResponse({
    sessionId: "77777777-7777-4777-8777-777777777777",
    redirectUrl: "https://pki.example.test/session",
  }));
  await assert.rejects(() => client.createSignatureSession({
    pdf: Buffer.from("pdf"), name: "doc.pdf", returnUrl: "http://portal.example.test/callback", callbackArgument: "ticket-id",
  }), /HTTPS/);
  await assert.rejects(() => client.signedPdfFromSession({ status: "UserCancelled", documents: [] }), /not complete/);
});
