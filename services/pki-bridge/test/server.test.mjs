import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAuthenticityRecord, signAuthenticityRecord } from "../src/authenticity-contract.mjs";
import { bodySha256, internalRequestMessage, verifyInternalResponse } from "../src/internal-auth.mjs";
import {
  createRequestHandler,
  listenAtomically,
  readConfiguredSecret,
  requiresPrivateSigningEvidenceKey,
} from "../src/server.mjs";

const publicId = "MAI-2026-1111-1111-1111-1111";
const internalKey = "internal-test-key-with-32-characters";

function internalRequest(body, target, nonce = "0123456789abcdef0123456789abcdef") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestDigest = bodySha256(Buffer.from(body));
  const digest = createHmac("sha256", internalKey).update(internalRequestMessage({
    timestamp, nonce, method: "POST", target, requestDigest,
  })).digest("hex");
  return {
    header: `${timestamp}.${nonce}.${digest}`,
    auth: { timestamp, nonce, requestDigest, method: "POST", target },
  };
}

test("carrega o HMAC interno por secret file e rejeita origem ambígua", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "maiocchi-hmac-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const secretFile = path.join(directory, "internal-hmac.key");
  await writeFile(secretFile, "a".repeat(64), { mode: 0o400 });

  assert.equal(await readConfiguredSecret(null, secretFile, "test key"), "a".repeat(64));
  await assert.rejects(readConfiguredSecret("b".repeat(64), secretFile, "test key"), /either/);
});

test("só exige chave ML-DSA quando uma modalidade PAdES foi habilitada", () => {
  assert.equal(requiresPrivateSigningEvidenceKey({ providerEndpoint: null, remoteProvider: null, localSigningEnabled: false }), false);
  assert.equal(requiresPrivateSigningEvidenceKey({ providerEndpoint: "http://provider", remoteProvider: null, localSigningEnabled: false }), false);
  assert.equal(requiresPrivateSigningEvidenceKey({ providerEndpoint: "http://provider", remoteProvider: null, localSigningEnabled: true }), true);
  assert.equal(requiresPrivateSigningEvidenceKey({ providerEndpoint: null, remoteProvider: {}, localSigningEnabled: false }), true);
});

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
  const repository = {
    async findByPublicId(id) { return id === publicId ? entry : null; },
    async appendObservation() { throw new Error("public verification must be read-only"); },
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
  assert.equal(health.version, "1.3.26");
  assert.equal(health.localA3Signing, "disabled");
  assert.equal(health.remoteSigning, "disabled");

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
  assert.equal(observation.status, 404);

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
  const historicalPublicKey = generateKeyPairSync("ed25519").publicKey;
  const calls = [];
  const privateSigningService = {
    provider: {},
    remoteProvider: {},
    localSigningEnabled: false,
    postQuantumSigner: {
      keyId: "ml-dsa-65-test",
      publicKey,
      publicKeys: new Map([
        ["ml-dsa-65-test", publicKey],
        ["ml-dsa-65-retired", historicalPublicKey],
      ]),
    },
    remoteSigningStatus() { return { ready: true, provider: "rest-pki-core", version: "test" }; },
    async verification(id) {
      return id === publicId ? { documentStatus: "active", proofVerified: true, envelope: { proof: { algorithm: "ML-DSA-65" } } } : null;
    },
    async evidencePage(id) { return id === publicId ? Buffer.from("%PDF-private-sheet") : null; },
    verifyEvidence(manifest, attestation) {
      return {
        verified: manifest?.publicId === publicId && attestation?.algorithm === "ML-DSA-65",
        algorithm: "ML-DSA-65",
        keyId: "ml-dsa-65-test",
        manifestSha256: "a".repeat(64),
      };
    },
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
    finalizeEvidence(input) {
      calls.push({ finalizeEvidence: input });
      return {
        manifest: {
          schema: "https://assinatura.maiocchi.adv.br/schemas/final-evidence-manifest-v1.json",
          version: "1.0.0", embeddedManifestSha256: input.attestation.manifestSha256,
          finalPdf: { mediaType: "application/pdf", sha256: input.finalPdfSha256, size: input.finalPdfSize },
          finalizedAt: input.finalizedAt,
        },
        attestation: { algorithm: "ML-DSA-65", code: "PQC-MLDSA65-AAAA-BBBB-CCCC-DDDD" },
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

  const health = await (await fetch(`${base}/healthz`)).json();
  assert.equal(health.privatePadesProvider, "ready");
  assert.equal(health.localA3Signing, "disabled");
  assert.equal(health.remoteSigning, "ready");
  assert.equal(health.remoteSigningProvider, "rest-pki-core");

  assert.equal((await fetch(`${base}/verificacao/${publicId}`)).status, 200);
  assert.equal((await fetch(`${base}/folha/${publicId}.pdf`)).status, 200);
  assert.equal((await fetch(`${base}/chaves-pqc/ml-dsa-65-test.pem`)).status, 200);
  assert.equal((await fetch(`${base}/chaves-pqc/ml-dsa-65-retired.pem`)).status, 200);

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
  const composeAuth = internalRequest(composeBody, "/internal/evidence/compose");
  const composed = await fetch(`${base}/internal/evidence/compose`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-maiocchi-signature": composeAuth.header },
    body: composeBody,
  });
  assert.equal(composed.status, 200);
  const composedText = await composed.text();
  assert.equal(verifyInternalResponse({
    header: composed.headers.get("x-maiocchi-response-signature"), secret: internalKey,
    requestAuth: composeAuth.auth, status: 200, rawBody: Buffer.from(composedText),
  }), true);
  const composedBody = JSON.parse(composedText);
  assert.equal(Buffer.from(composedBody.presentationPdfBase64, "base64").toString(), "%PDF-composed");
  assert.equal(composedBody.attestation.algorithm, "ML-DSA-65");

  const verifyBody = JSON.stringify({ manifest: { publicId }, attestation: { algorithm: "ML-DSA-65" } });
  const verifyAuth = internalRequest(verifyBody, "/internal/evidence/verify", "fedcba9876543210fedcba9876543210");
  const verified = await fetch(`${base}/internal/evidence/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-maiocchi-signature": verifyAuth.header },
    body: verifyBody,
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).verified, true);

  const replayed = await fetch(`${base}/internal/evidence/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-maiocchi-signature": verifyAuth.header },
    body: verifyBody,
  });
  assert.equal(replayed.status, 409);
  assert.equal((await replayed.json()).error.code, "request_replayed");

  const finalizeBody = JSON.stringify({
    manifest: { publicId }, attestation: { algorithm: "ML-DSA-65", manifestSha256: "b".repeat(64) },
    finalPdfSha256: "c".repeat(64), finalPdfSize: 2048, finalizedAt: "2026-07-15T03:00:00.000Z",
  });
  const finalizeAuth = internalRequest(finalizeBody, "/internal/evidence/finalize", "00112233445566778899aabbccddeeff");
  const finalized = await fetch(`${base}/internal/evidence/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-maiocchi-signature": finalizeAuth.header },
    body: finalizeBody,
  });
  assert.equal(finalized.status, 200);
  assert.equal((await finalized.json()).manifest.finalPdf.sha256, "c".repeat(64));
});

test("isola rotas internas do listener público e rotas públicas do listener interno", async (context) => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const options = {
    repository: { async findByPublicId() { return null; } }, artifactStore: { encryptedAtRest: true },
    privateKey, publicKey, keyId: "authenticity-2026-01", internalHmacKey: internalKey,
  };
  const publicServer = http.createServer(createRequestHandler({ ...options, surface: "public" }));
  const internalServer = http.createServer(createRequestHandler({ ...options, surface: "internal" }));
  await Promise.all([
    new Promise((resolve) => publicServer.listen(0, "127.0.0.1", resolve)),
    new Promise((resolve) => internalServer.listen(0, "127.0.0.1", resolve)),
  ]);
  context.after(() => Promise.all([
    new Promise((resolve) => publicServer.close(resolve)),
    new Promise((resolve) => internalServer.close(resolve)),
  ]));
  const publicBase = `http://127.0.0.1:${publicServer.address().port}`;
  const internalBase = `http://127.0.0.1:${internalServer.address().port}`;
  assert.equal((await fetch(`${publicBase}/internal/evidence/verify`, { method: "POST", body: "{}" })).status, 404);
  assert.equal((await fetch(`${internalBase}/verificacao/${publicId}`)).status, 404);
  assert.equal((await fetch(`${internalBase}/healthz`)).status, 200);
});

test("fecha o listener já aberto quando o segundo endereço falha", async (context) => {
  const occupied = http.createServer();
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => occupied.close(resolve)));
  const first = http.createServer();
  const second = http.createServer();

  await assert.rejects(
    listenAtomically([
      { server: first, port: 0, host: "127.0.0.1" },
      { server: second, port: occupied.address().port, host: "127.0.0.1" },
    ]),
    /EADDRINUSE/,
  );

  assert.equal(first.listening, false);
  assert.equal(second.listening, false);
});
