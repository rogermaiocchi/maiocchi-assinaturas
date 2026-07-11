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
    securityContextId: "security-context",
    fetchImpl,
  });
}

test("falha fechado sem configuração obrigatória ou HTTPS", () => {
  assert.throws(() => new RestPkiCoreClient({}), PkiConfigurationError);
  assert.throws(() => new RestPkiCoreClient({ endpoint: "http://pki.example.test", apiKey: "credential", securityContextId: "context" }), /HTTPS/);
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
});
