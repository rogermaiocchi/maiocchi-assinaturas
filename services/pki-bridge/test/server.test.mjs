import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import http from "node:http";
import test from "node:test";
import { buildAuthenticityRecord, signAuthenticityRecord } from "../src/authenticity-contract.mjs";
import { createRequestHandler } from "../src/server.mjs";

const publicId = "MAI-2026-1111-1111-1111-1111";

function makeEnvelope(privateKey) {
  const record = buildAuthenticityRecord({
    publicId,
    revision: 1,
    originalSha256: "a".repeat(64),
    originalSize: 1200,
    finalizedAt: "2026-07-12T12:00:00.000Z",
    profile: "AD-RB",
    policyOid: "2.16.76.1.7.1.12.2.1",
    signatureCount: 1,
    signatures: [{ certificateFingerprintSha256: "e".repeat(64), signingTime: "2026-07-12T12:00:00.000Z", signerName: "Assinante de teste" }],
    validatedAt: "2026-07-12T12:01:00.000Z",
    validator: "Validador de teste",
    validatorKeyId: "validator-2026-01",
    validationAttestationSha256: "d".repeat(64),
    validationReportSha256: "b".repeat(64),
    validationReportSize: 300,
    representationSha256: "c".repeat(64),
    representationSize: 900,
    disclosureMode: "restricted",
  });
  return signAuthenticityRecord(record, { privateKey, keyId: "authenticity-2026-01" });
}

test("expõe verificação, CORS restrito, redirect e bloqueio do original", async (context) => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const envelope = makeEnvelope(privateKey);
  const entry = {
    document_id: "11111111-1111-4111-8111-111111111111",
    record_id: "22222222-2222-4222-8222-222222222222",
    status: "active",
    disclosure_mode: "restricted",
    original_storage_key: `sha256/aa/${"a".repeat(64)}.pdf`,
    representation_storage_key: `sha256/cc/${"c".repeat(64)}.pdf`,
    envelope,
  };
  const events = [];
  const repository = {
    async findByPublicId(id) { return id === publicId ? entry : null; },
    async appendObservation(_entry, event) { events.push(event); },
  };
  const artifactStore = { async get() { return Buffer.from("%PDF-test"); } };
  const handler = createRequestHandler({
    repository,
    artifactStore,
    privateKey,
    publicKey,
    keyId: "authenticity-2026-01",
    internalHmacKey: "internal-test-key-with-32-characters",
    allowedOrigins: ["https://preview.example"],
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const verification = await fetch(`${base}/verificacao/${publicId}`, { headers: { origin: "https://preview.example" } });
  assert.equal(verification.status, 200);
  assert.equal(verification.headers.get("access-control-allow-origin"), "https://preview.example");
  assert.equal((await verification.json()).proofVerified, true);

  const publicKeyResponse = await fetch(`${base}/chaves/authenticity-2026-01.pem`);
  assert.equal(publicKeyResponse.status, 200);
  assert.match(await publicKeyResponse.text(), /BEGIN PUBLIC KEY/);

  const preflight = await fetch(`${base}/verificacao/${publicId}/evento`, { method: "OPTIONS", headers: { origin: "https://preview.example" } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);

  const observation = await fetch(`${base}/verificacao/${publicId}/evento`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://preview.example" },
    body: JSON.stringify({ result: "match" }),
  });
  assert.equal(observation.status, 204);
  assert.deepEqual(events.map((event) => event.eventType), ["hash_matched"]);

  const deniedPreflight = await fetch(`${base}/verificacao/${publicId}/evento`, { method: "OPTIONS", headers: { origin: "https://untrusted.example" } });
  assert.equal(deniedPreflight.status, 403);
  assert.equal(deniedPreflight.headers.get("access-control-allow-origin"), null);
  assert.equal(deniedPreflight.headers.get("vary"), "Origin");

  const redirect = await fetch(`${base}/v/${publicId}`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), `/validar/?codigo=${publicId}`);

  const restricted = await fetch(`${base}/original/${publicId}.pdf`);
  assert.equal(restricted.status, 403);
  assert.equal((await restricted.json()).error.code, "restricted");

  entry.envelope = structuredClone(envelope);
  entry.envelope.record.document.revision = 2;
  const tampered = await fetch(`${base}/verificacao/${publicId}`);
  assert.equal(tampered.status, 503);
});
