import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
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

  const health = await (await fetch(`${base}/healthz`)).json();
  assert.equal(health.service, "pki-bridge");
  assert.equal(health.version, "1.3.19");

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
  assert.equal(redirect.headers.get("location"), `/validar?codigo=${publicId}`);

  const restricted = await fetch(`${base}/original/${publicId}.pdf`);
  assert.equal(restricted.status, 403);
  assert.equal((await restricted.json()).error.code, "restricted");

  entry.envelope = structuredClone(envelope);
  entry.envelope.record.document.revision = 2;
  const tampered = await fetch(`${base}/verificacao/${publicId}`);
  assert.equal(tampered.status, 503);
});

test("integra verificação privada, folha incorporada, chave PQC e metadados remotos", async (context) => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const calls = [];
  const privateSigningService = {
    provider: {},
    remoteProvider: {},
    postQuantumSigner: { keyId: "ml-dsa-65-test", publicKey },
    async verification(id) {
      return id === publicId ? { documentStatus: "active", proofVerified: true, envelope: { proof: { algorithm: "ML-DSA-65" } } } : null;
    },
    async evidencePage(id) { return id === publicId ? Buffer.from("%PDF-private-sheet") : null; },
    async observe(id, result) { calls.push({ id, result }); return id === publicId; },
    async startRemote(token, metadata) {
      calls.push({ token, metadata });
      return { sessionId: "77777777-7777-4777-8777-777777777777", redirectUrl: "https://psc.example.test/authorize" };
    },
    async composeEvidence(input) {
      calls.push({ composeEvidence: input });
      return {
        presentation: Buffer.from("%PDF-composed"), evidencePage: Buffer.from("%PDF-evidence"),
        manifest: { publicId: input.publicId },
        attestation: { algorithm: "ML-DSA-65", code: "PQC-MLDSA65-1111-2222-3333-4444" },
        totalPages: 2, verificationUrl: `https://assinatura.maiocchi.adv.br/validar?codigo=${input.publicId}`,
        barcodeValue: `MAI|${input.publicId}|R1`,
      };
    },
  };
  const handler = createRequestHandler({
    repository: { async findByPublicId() { return null; } },
    artifactStore: { encryptedAtRest: true },
    privateKey, publicKey, keyId: "authenticity-2026-01",
    internalHmacKey: "internal-test-key-with-32-characters",
    privateSigningService,
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${base}/verificacao/${publicId}`)).status, 200);
  assert.equal((await fetch(`${base}/folha/${publicId}.pdf`)).status, 200);
  assert.equal((await fetch(`${base}/chaves-pqc/ml-dsa-65-test.pem`)).status, 200);

  const token = "A".repeat(43);
  const remote = await fetch(`${base}/api/pades/remote/session`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ clientMetadata: { platform: "MacIntel", timezone: "America/Sao_Paulo" } }),
  });
  assert.equal(remote.status, 201);
  assert.equal(calls.at(-1).metadata.observedIp, "203.0.113.9");
  assert.equal(calls.at(-1).metadata.clientMetadata.platform, "MacIntel");

  const composeBody = JSON.stringify({
    pdfBase64: Buffer.from("%PDF-source").toString("base64"),
    publicId,
    documentNumber: "20260714015027128612677818923",
    documentName: "documento.pdf",
    documentContext: {},
    signingMetadata: { profile: "SIMPLES RASTREÁVEL" },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const internalKey = "internal-test-key-with-32-characters";
  const digest = createHmac("sha256", internalKey).update(timestamp).update(".").update(composeBody).digest("hex");
  const composed = await fetch(`${base}/internal/evidence/compose`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-maiocchi-signature": `${timestamp}.${digest}` },
    body: composeBody,
  });
  assert.equal(composed.status, 200);
  const composedBody = await composed.json();
  assert.equal(Buffer.from(composedBody.presentationPdfBase64, "base64").toString(), "%PDF-composed");
  assert.equal(composedBody.attestation.algorithm, "ML-DSA-65");
});
