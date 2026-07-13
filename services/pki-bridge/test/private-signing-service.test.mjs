import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { PrivateSigningService } from "../src/private-signing-service.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const policyOid = "2.16.76.1.7.1.11.1.3";
const allowedPolicyOids = new Set([policyOid]);

async function onePagePdf() {
  const document = await PDFDocument.create();
  document.addPage([595.28, 841.89]);
  return Buffer.from(await document.save());
}

const postQuantumSigner = {
  keyId: "ml-dsa-65-test",
  attest(manifest) {
    return {
      algorithm: "ML-DSA-65", keyId: this.keyId,
      manifestSha256: sha256(JSON.stringify(manifest)),
      code: "PQC-MLDSA65-1111-2222-3333-4444",
      signatureBase64url: Buffer.from("test-signature").toString("base64url"),
    };
  },
  verify() { return true; },
};

class MemoryRepository {
  constructor() { this.ticket = null; this.remoteSession = null; this.events = []; }
  async create({ tokenHash, documentName, sourceArtifact, expiresAt, publicId, documentNumber, documentContext }) {
    this.ticket = {
      id: "11111111-1111-4111-8111-111111111111", token_sha256: Buffer.from(tokenHash, "hex"),
      document_name: documentName, source_pdf_sha256: Buffer.from(sourceArtifact.sha256, "hex"),
      source_pdf_storage_key: sourceArtifact.storageKey, source_pdf_size: sourceArtifact.size,
      public_id: publicId, document_number: documentNumber, document_context: documentContext,
      status: "pending", expires_at: expiresAt, created_at: new Date().toISOString(),
    };
  }
  async findByTokenHash(hash) { return this.ticket && this.ticket.token_sha256.equals(Buffer.from(hash, "hex")) ? this.ticket : null; }
  async findByPublicId(id) { return this.ticket?.public_id === id ? this.ticket : null; }
  async markPresentation(_ticket, values) {
    Object.assign(this.ticket, {
      source_page_count: values.sourcePageCount,
      presentation_pdf_sha256: Buffer.from(values.presentationArtifact.sha256, "hex"),
      presentation_pdf_storage_key: values.presentationArtifact.storageKey,
      presentation_pdf_size: values.presentationArtifact.size,
      presentation_page_count: values.presentationPageCount,
      evidence_page_storage_key: values.evidencePageArtifact.storageKey,
      evidence_page_sha256: Buffer.from(values.evidencePageArtifact.sha256, "hex"),
      evidence_page_size: values.evidencePageArtifact.size,
      evidence_manifest: values.manifest,
      pqc_attestation: values.attestation,
      pqc_key_id: values.attestation.keyId,
      pqc_code: values.attestation.code,
      signing_metadata: values.signingMetadata,
    });
    return this.ticket;
  }
  async markPrepared(_ticket, values) {
    Object.assign(this.ticket, {
      status: "prepared", provider_session_id: values.providerSessionId,
      certificate_fingerprint_sha256: Buffer.from(values.certificateFingerprint, "hex"),
      to_be_signed_sha256: Buffer.from(values.toBeSignedSha256, "hex"),
    });
    return this.ticket;
  }
  async markCompleted(_ticket, { signedArtifact, validation, finalManifest, finalAttestation, finalizedAt }) {
    Object.assign(this.ticket, {
      status: "completed", signed_pdf_sha256: Buffer.from(signedArtifact.sha256, "hex"),
      signed_pdf_storage_key: signedArtifact.storageKey, validation_report: validation,
      signed_pdf_size: signedArtifact.size, completed_at: finalizedAt,
      final_evidence_manifest: finalManifest, final_pqc_attestation: finalAttestation,
      final_pqc_code: finalAttestation.code,
    });
    return this.ticket;
  }
  async createRemoteSession(ticket, { providerSessionId }) {
    if (this.remoteSession?.status === "pending") throw Object.assign(new Error("remote signature session already exists"), { status: 409 });
    this.remoteSession = { ticket_id: ticket.id, provider_session_id: providerSessionId, status: "pending" };
    return this.remoteSession;
  }
  async findRemoteSession(ticketId) { return this.remoteSession?.ticket_id === ticketId && this.remoteSession.status === "pending" ? this.remoteSession : null; }
  async markRemoteTerminal(_ticket, { providerSessionId, status }) {
    assert.equal(this.remoteSession.provider_session_id, providerSessionId);
    this.remoteSession.status = status;
    return this.remoteSession;
  }
  async markRemoteCompleted(_ticket, { providerSessionId, signedArtifact, validation, finalManifest, finalAttestation, finalizedAt }) {
    assert.equal(this.remoteSession.provider_session_id, providerSessionId);
    this.remoteSession.status = "completed";
    Object.assign(this.ticket, {
      status: "completed", signed_pdf_sha256: Buffer.from(signedArtifact.sha256, "hex"),
      signed_pdf_storage_key: signedArtifact.storageKey, validation_report: validation,
      signed_pdf_size: signedArtifact.size, completed_at: finalizedAt,
      final_evidence_manifest: finalManifest, final_pqc_attestation: finalAttestation,
      final_pqc_code: finalAttestation.code,
    });
    return this.ticket;
  }
  async event(_ticketId, eventType, outcome, details) { this.events.push({ eventType, outcome, details }); }
}

class MemoryArtifacts {
  constructor() { this.values = new Map(); }
  async put(bytes) {
    const digest = sha256(bytes);
    const value = { storageKey: `sha256/${digest.slice(0, 2)}/${digest}.pdf`, sha256: digest, size: bytes.length };
    this.values.set(value.storageKey, Buffer.from(bytes));
    return value;
  }
  async get(key) { return this.values.get(key); }
}

test("ticket privado vincula PDF, certificado, tarefa e resultado validado", async () => {
  const repository = new MemoryRepository();
  const artifactStore = new MemoryArtifacts();
  const sourcePdf = await onePagePdf();
  const signedPdf = Buffer.from("%PDF-1.7\nsigned");
  const certificateFingerprint = "a".repeat(64);
  const provider = {
    async prepare({ pdf }) {
      assert.notDeepEqual(pdf, sourcePdf);
      assert.equal((await PDFDocument.load(pdf)).getPageCount(), 2);
      return {
        sessionId: "22222222-2222-4222-8222-222222222222",
        toBeSignedBase64: Buffer.from("dtbs").toString("base64"), digestAlgorithm: "SHA-256",
        signatureAlgorithm: "RSA-SHA256", documentSha256: sha256(pdf),
        certificateFingerprintSha256: certificateFingerprint, expiresAt: new Date(Date.now() + 120_000).toISOString(),
      };
    },
    async complete({ sessionId, signatureBase64 }) {
      assert.equal(sessionId, "22222222-2222-4222-8222-222222222222");
      assert.equal(signatureBase64, Buffer.from("signature").toString("base64"));
      return { pdf: signedPdf, signedPdfSha256: sha256(signedPdf), validation: { trusted: true, cryptographicIntegrity: true } };
    },
  };
  const service = new PrivateSigningService({ repository, artifactStore, provider, postQuantumSigner, baseUrl: "https://assinatura.maiocchi.adv.br" });
  const created = await service.createTicket({ pdf: sourcePdf, documentName: "Contrato cliente.pdf", ttlSeconds: 600 });
  assert.match(created.url, /^https:\/\/assinatura\.maiocchi\.adv\.br\/assinar-icp#ticket=[A-Za-z0-9_-]{43}$/);
  assert.equal(created.sourcePdfSha256, sha256(sourcePdf));
  assert.match(created.publicId, /^MAI-\d{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  assert.match(created.documentNumber, /^\d{29}$/);
  assert.doesNotMatch(repository.ticket.token_sha256.toString("hex"), /ticket=/);

  const token = new URL(created.url).hash.slice("#ticket=".length);
  const task = await service.prepare(token, { certificateBase64: "certificate", chainBase64: [] });
  assert.equal(task.documentName, "Contrato-cliente.pdf");
  assert.equal(task.dataToSignBase64, Buffer.from("dtbs").toString("base64"));
  assert.match(task.presentationSha256, /^[a-f0-9]{64}$/);
  assert.equal(task.documentSha256, task.presentationSha256);
  assert.equal(task.sourceDocumentSha256, sha256(sourcePdf));
  assert.equal("toBeSignedBase64" in task, false);
  assert.equal(repository.ticket.status, "prepared");

  const result = await service.complete(token, {
    signatureBase64: Buffer.from("signature").toString("base64"),
    certificateFingerprintSha256: certificateFingerprint,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.signedPdfSha256, sha256(signedPdf));
  assert.deepEqual((await service.result(token)).bytes, signedPdf);
  const verification = await service.verification(created.publicId);
  assert.equal(verification.proofVerified, true);
  assert.equal(verification.envelope.proof.scope, "final-pades-record");
  assert.equal(verification.envelope.record.document.hash.value, sha256(signedPdf));
  const finalHash = repository.ticket.signed_pdf_sha256;
  repository.ticket.signed_pdf_sha256 = Buffer.alloc(32, 9);
  await assert.rejects(() => service.verification(created.publicId), (error) => error.status === 503);
  repository.ticket.signed_pdf_sha256 = finalHash;
  await assert.rejects(() => service.complete(token, {
    signatureBase64: "again", certificateFingerprintSha256: certificateFingerprint,
  }), (error) => error.status === 409);
});

test("bloqueia certificado diferente do preparado", async () => {
  const repository = new MemoryRepository();
  const artifactStore = new MemoryArtifacts();
  const pdf = await onePagePdf();
  const provider = {
    async prepare({ pdf: preparedPdf }) {
      return { sessionId: "33333333-3333-4333-8333-333333333333", toBeSignedBase64: "ZHRicw==",
        digestAlgorithm: "SHA-256", signatureAlgorithm: "RSA-SHA256", documentSha256: sha256(preparedPdf),
        certificateFingerprintSha256: "b".repeat(64), expiresAt: new Date(Date.now() + 120_000).toISOString() };
    },
  };
  const service = new PrivateSigningService({ repository, artifactStore, provider, postQuantumSigner, baseUrl: "https://assinatura.maiocchi.adv.br" });
  const created = await service.createTicket({ pdf, ttlSeconds: 600 });
  const token = new URL(created.url).hash.slice("#ticket=".length);
  await service.prepare(token, { certificateBase64: "certificate" });
  await assert.rejects(() => service.complete(token, {
    signatureBase64: "c2ln", certificateFingerprintSha256: "c".repeat(64),
  }), (error) => error.status === 409);
});

test("assina em PSC remoto sem agente local e valida antes de liberar", async () => {
  const repository = new MemoryRepository();
  const artifactStore = new MemoryArtifacts();
  const sourcePdf = await onePagePdf();
  const signedPdf = Buffer.from("%PDF-1.7\nremote-signed");
  const sessionId = "77777777-7777-4777-8777-777777777777";
  const remoteProvider = {
    async createSignatureSession({ pdf, returnUrl, callbackArgument }) {
      assert.notDeepEqual(pdf, sourcePdf);
      assert.equal((await PDFDocument.load(pdf)).getPageCount(), 2);
      assert.equal(returnUrl, "https://assinatura.maiocchi.adv.br/assinar-icp/");
      assert.equal(callbackArgument, repository.ticket.id);
      return { sessionId, redirectUrl: "https://psc.example.test/authorize" };
    },
    async getSignatureSession(id) {
      assert.equal(id, sessionId);
      return { id, status: "Completed", callbackArgument: repository.ticket.id, documents: [{}] };
    },
    async signedPdfFromSession() { return { pdf: signedPdf, name: "final.pdf" }; },
    async inspectPdf(pdf) {
      assert.deepEqual(pdf, signedPdf);
      return { success: true, signers: [{ signaturePolicy: { oid: policyOid }, validationResults: { passed: true } }] };
    },
  };
  assert.throws(() => new PrivateSigningService({
    repository, artifactStore, remoteProvider, postQuantumSigner,
    baseUrl: "https://assinatura.maiocchi.adv.br",
  }), /policy allowlist/);
  const service = new PrivateSigningService({
    repository, artifactStore, remoteProvider, postQuantumSigner, allowedPolicyOids,
    baseUrl: "https://assinatura.maiocchi.adv.br",
  });
  const created = await service.createTicket({ pdf: sourcePdf, ttlSeconds: 600 });
  const token = new URL(created.url).hash.slice("#ticket=".length);
  assert.equal((await service.status(token)).remoteSigningAvailable, true);
  assert.equal((await service.status(token)).localSigningAvailable, false);
  assert.equal((await service.startRemote(token)).redirectUrl, "https://psc.example.test/authorize");
  const completed = await service.completeRemote(token, { signatureSessionId: sessionId });
  assert.equal(completed.status, "completed");
  assert.equal(completed.signedPdfSha256, sha256(signedPdf));
  assert.deepEqual((await service.result(token)).bytes, signedPdf);
});

test("permite nova sessão remota após cancelamento", async () => {
  const repository = new MemoryRepository();
  const artifactStore = new MemoryArtifacts();
  let attempt = 0;
  const remoteProvider = {
    async createSignatureSession() {
      attempt += 1;
      return {
        sessionId: attempt === 1 ? "77777777-7777-4777-8777-777777777777" : "88888888-8888-4888-8888-888888888888",
        redirectUrl: `https://psc.example.test/authorize/${attempt}`,
      };
    },
    async getSignatureSession(id) {
      return { id, status: "UserCancelled", callbackArgument: repository.ticket.id, documents: [] };
    },
  };
  const service = new PrivateSigningService({
    repository, artifactStore, provider: { async prepare() { throw new Error("must not reach provider"); } },
    remoteProvider, postQuantumSigner, allowedPolicyOids, baseUrl: "https://assinatura.maiocchi.adv.br",
  });
  const created = await service.createTicket({ pdf: await onePagePdf(), ttlSeconds: 600 });
  const token = new URL(created.url).hash.slice("#ticket=".length);
  const first = await service.startRemote(token);
  assert.equal((await service.completeRemote(token, { signatureSessionId: first.sessionId })).status, "cancelled");
  await assert.rejects(() => service.prepare(token, { certificateBase64: "certificate" }), (error) => error.status === 409);
  const second = await service.startRemote(token);
  assert.notEqual(second.sessionId, first.sessionId);
});

test("encerra sessão PSC que devolve PAdES fora da política", async () => {
  const repository = new MemoryRepository();
  const artifactStore = new MemoryArtifacts();
  const sessionId = "99999999-9999-4999-8999-999999999999";
  const remoteProvider = {
    async createSignatureSession() { return { sessionId, redirectUrl: "https://psc.example.test/authorize" }; },
    async getSignatureSession() {
      return { id: sessionId, status: "Completed", callbackArgument: repository.ticket.id, documents: [{}] };
    },
    async signedPdfFromSession() { return { pdf: Buffer.from("%PDF-1.7\nsigned") }; },
    async inspectPdf() {
      return { success: true, signers: [{ signaturePolicy: { oid: "1.2.3" }, validationResults: { passed: true } }] };
    },
  };
  const service = new PrivateSigningService({
    repository, artifactStore, remoteProvider, postQuantumSigner, allowedPolicyOids,
    baseUrl: "https://assinatura.maiocchi.adv.br",
  });
  const created = await service.createTicket({ pdf: await onePagePdf(), ttlSeconds: 600 });
  const token = new URL(created.url).hash.slice("#ticket=".length);
  await service.startRemote(token);
  await assert.rejects(() => service.completeRemote(token, { signatureSessionId: sessionId }), (error) => error.status === 422);
  assert.equal(repository.remoteSession.status, "failed");
});
