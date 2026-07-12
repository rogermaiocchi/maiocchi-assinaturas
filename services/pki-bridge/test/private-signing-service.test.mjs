import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PrivateSigningService } from "../src/private-signing-service.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

class MemoryRepository {
  constructor() { this.ticket = null; this.events = []; }
  async create({ tokenHash, documentName, sourceArtifact, expiresAt }) {
    this.ticket = {
      id: "11111111-1111-4111-8111-111111111111", token_sha256: Buffer.from(tokenHash, "hex"),
      document_name: documentName, source_pdf_sha256: Buffer.from(sourceArtifact.sha256, "hex"),
      source_pdf_storage_key: sourceArtifact.storageKey, source_pdf_size: sourceArtifact.size,
      status: "pending", expires_at: expiresAt,
    };
  }
  async findByTokenHash(hash) { return this.ticket && this.ticket.token_sha256.equals(Buffer.from(hash, "hex")) ? this.ticket : null; }
  async markPrepared(_ticket, values) {
    Object.assign(this.ticket, {
      status: "prepared", provider_session_id: values.providerSessionId,
      certificate_fingerprint_sha256: Buffer.from(values.certificateFingerprint, "hex"),
      to_be_signed_sha256: Buffer.from(values.toBeSignedSha256, "hex"),
    });
    return this.ticket;
  }
  async markCompleted(_ticket, { signedArtifact, validation }) {
    Object.assign(this.ticket, {
      status: "completed", signed_pdf_sha256: Buffer.from(signedArtifact.sha256, "hex"),
      signed_pdf_storage_key: signedArtifact.storageKey, validation_report: validation,
    });
    return this.ticket;
  }
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
  const sourcePdf = Buffer.from("%PDF-1.7\nsource");
  const signedPdf = Buffer.from("%PDF-1.7\nsigned");
  const certificateFingerprint = "a".repeat(64);
  const provider = {
    async prepare({ pdf }) {
      assert.deepEqual(pdf, sourcePdf);
      return {
        sessionId: "22222222-2222-4222-8222-222222222222",
        toBeSignedBase64: Buffer.from("dtbs").toString("base64"), digestAlgorithm: "SHA-256",
        signatureAlgorithm: "RSA-SHA256", documentSha256: sha256(sourcePdf),
        certificateFingerprintSha256: certificateFingerprint, expiresAt: new Date(Date.now() + 120_000).toISOString(),
      };
    },
    async complete({ sessionId, signatureBase64 }) {
      assert.equal(sessionId, "22222222-2222-4222-8222-222222222222");
      assert.equal(signatureBase64, Buffer.from("signature").toString("base64"));
      return { pdf: signedPdf, signedPdfSha256: sha256(signedPdf), validation: { trusted: true, cryptographicIntegrity: true } };
    },
  };
  const service = new PrivateSigningService({ repository, artifactStore, provider, baseUrl: "https://assinatura.maiocchi.adv.br" });
  const created = await service.createTicket({ pdf: sourcePdf, documentName: "Contrato cliente.pdf", ttlSeconds: 600 });
  assert.match(created.url, /^https:\/\/assinatura\.maiocchi\.adv\.br\/assinar-icp#ticket=[A-Za-z0-9_-]{43}$/);
  assert.equal(created.sourcePdfSha256, sha256(sourcePdf));
  assert.doesNotMatch(repository.ticket.token_sha256.toString("hex"), /ticket=/);

  const token = new URL(created.url).hash.slice("#ticket=".length);
  const task = await service.prepare(token, { certificateBase64: "certificate", chainBase64: [] });
  assert.equal(task.documentName, "Contrato-cliente.pdf");
  assert.equal(task.dataToSignBase64, Buffer.from("dtbs").toString("base64"));
  assert.equal("toBeSignedBase64" in task, false);
  assert.equal(repository.ticket.status, "prepared");

  const result = await service.complete(token, {
    signatureBase64: Buffer.from("signature").toString("base64"),
    certificateFingerprintSha256: certificateFingerprint,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.signedPdfSha256, sha256(signedPdf));
  assert.deepEqual((await service.result(token)).bytes, signedPdf);
  await assert.rejects(() => service.complete(token, {
    signatureBase64: "again", certificateFingerprintSha256: certificateFingerprint,
  }), (error) => error.status === 409);
});

test("bloqueia certificado diferente do preparado", async () => {
  const repository = new MemoryRepository();
  const artifactStore = new MemoryArtifacts();
  const pdf = Buffer.from("%PDF-1.7\ntest");
  const provider = {
    async prepare() {
      return { sessionId: "33333333-3333-4333-8333-333333333333", toBeSignedBase64: "ZHRicw==",
        digestAlgorithm: "SHA-256", signatureAlgorithm: "RSA-SHA256", documentSha256: sha256(pdf),
        certificateFingerprintSha256: "b".repeat(64), expiresAt: new Date(Date.now() + 120_000).toISOString() };
    },
  };
  const service = new PrivateSigningService({ repository, artifactStore, provider, baseUrl: "https://assinatura.maiocchi.adv.br" });
  const created = await service.createTicket({ pdf, ttlSeconds: 600 });
  const token = new URL(created.url).hash.slice("#ticket=".length);
  await service.prepare(token, { certificateBase64: "certificate" });
  await assert.rejects(() => service.complete(token, {
    signatureBase64: "c2ln", certificateFingerprintSha256: "c".repeat(64),
  }), (error) => error.status === 409);
});
