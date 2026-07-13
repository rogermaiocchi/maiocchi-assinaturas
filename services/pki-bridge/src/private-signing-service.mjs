import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_PDF_BYTES = 40 * 1024 * 1024;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function safeName(value) {
  let name = typeof value === "string" && value.trim() ? value.trim() : "documento.pdf";
  name = name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120);
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function tokenHash(token) {
  if (!TOKEN_PATTERN.test(token || "")) throw Object.assign(new Error("ticket is invalid"), { status: 401 });
  return sha256(token);
}

function assertActive(ticket) {
  if (!ticket || new Date(ticket.expires_at) <= new Date()) throw Object.assign(new Error("ticket expired or not found"), { status: 410 });
}

export class PrivateSigningService {
  constructor({ repository, artifactStore, provider = null, remoteProvider = null, baseUrl }) {
    this.repository = repository;
    this.artifactStore = artifactStore;
    this.provider = provider;
    this.remoteProvider = remoteProvider;
    this.baseUrl = new URL(baseUrl);
  }

  async createTicket({ pdf, documentName, ttlSeconds = 600 }) {
    if (!Buffer.isBuffer(pdf) || pdf.length < 5 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new TypeError("source PDF is invalid");
    }
    const ttl = Number(ttlSeconds);
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 1800) throw new TypeError("ticket TTL is invalid");
    const token = randomBytes(32).toString("base64url");
    const sourceArtifact = await this.artifactStore.put(pdf, { extension: "pdf" });
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    await this.repository.create({ tokenHash: sha256(token), documentName: safeName(documentName), sourceArtifact, expiresAt });
    const url = new URL("/assinar-icp", this.baseUrl);
    url.hash = `ticket=${token}`;
    return { url: url.toString(), expiresAt, sourcePdfSha256: sourceArtifact.sha256 };
  }

  async status(token) {
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    return {
      status: ticket.status,
      documentName: ticket.document_name,
      documentSha256: Buffer.from(ticket.source_pdf_sha256).toString("hex"),
      expiresAt: new Date(ticket.expires_at).toISOString(),
      signedPdfSha256: ticket.signed_pdf_sha256 ? Buffer.from(ticket.signed_pdf_sha256).toString("hex") : null,
      localSigningAvailable: Boolean(this.provider),
      remoteSigningAvailable: Boolean(this.remoteProvider),
    };
  }

  async startRemote(token) {
    if (!this.remoteProvider) throw Object.assign(new Error("remote signing provider is unavailable"), { status: 503 });
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "pending") throw Object.assign(new Error("ticket is not pending"), { status: 409 });
    if (await this.repository.findRemoteSession(ticket.id)) {
      throw Object.assign(new Error("remote signature session already exists"), { status: 409 });
    }
    const pdf = await this.artifactStore.get(ticket.source_pdf_storage_key);
    const returnUrl = new URL("/assinar-icp/", this.baseUrl).toString();
    const session = await this.remoteProvider.createSignatureSession({
      pdf,
      name: ticket.document_name,
      returnUrl,
      callbackArgument: ticket.id,
    });
    await this.repository.createRemoteSession(ticket, { providerSessionId: session.sessionId });
    return session;
  }

  async completeRemote(token, { signatureSessionId }) {
    if (!this.remoteProvider) throw Object.assign(new Error("remote signing provider is unavailable"), { status: 503 });
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "pending") throw Object.assign(new Error("ticket is not pending"), { status: 409 });
    const stored = await this.repository.findRemoteSession(ticket.id);
    if (!stored || stored.provider_session_id !== signatureSessionId) {
      throw Object.assign(new Error("remote signature session does not match the ticket"), { status: 409 });
    }
    const session = await this.remoteProvider.getSignatureSession(signatureSessionId);
    if (session.callbackArgument !== ticket.id) {
      throw Object.assign(new Error("remote signature session is not bound to the ticket"), { status: 409 });
    }
    const terminalStatus = {
      UserCancelled: "cancelled",
      Expired: "expired",
      ProcessingError: "failed",
    }[session.status];
    if (terminalStatus) {
      await this.repository.markRemoteTerminal(ticket, { providerSessionId: signatureSessionId, status: terminalStatus });
      return { status: terminalStatus };
    }
    if (session.status !== "Completed") {
      throw Object.assign(new Error("remote signature session is not complete"), { status: 409 });
    }
    const { pdf } = await this.remoteProvider.signedPdfFromSession(session);
    const inspection = await this.remoteProvider.inspectPdf(pdf);
    const signers = Array.isArray(inspection.signers) ? inspection.signers : [];
    if (!inspection.success || signers.length === 0 || signers.some((signer) => signer?.validationResults?.passed !== true)) {
      throw Object.assign(new Error("remote PAdES did not pass validation"), { status: 422 });
    }
    const signedArtifact = await this.artifactStore.put(pdf, { extension: "pdf" });
    await this.repository.markRemoteCompleted(ticket, {
      providerSessionId: signatureSessionId,
      signedArtifact,
      validation: { provider: "rest_pki_core", inspection },
    });
    return { status: "completed", signedPdfSha256: signedArtifact.sha256, validation: inspection };
  }

  async prepare(token, { certificateBase64, chainBase64 = [] }) {
    if (!this.provider) throw Object.assign(new Error("local signing provider is unavailable"), { status: 503 });
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "pending") throw Object.assign(new Error("ticket is not pending"), { status: 409 });
    const pdf = await this.artifactStore.get(ticket.source_pdf_storage_key);
    const task = await this.provider.prepare({ pdf, name: ticket.document_name, certificateBase64, chainBase64 });
    const certificateFingerprint = task.certificateFingerprintSha256;
    const sourceHash = Buffer.from(ticket.source_pdf_sha256).toString("hex");
    if (task.documentSha256 !== sourceHash || !/^[a-f0-9]{64}$/.test(certificateFingerprint)) {
      throw Object.assign(new Error("provider task is not bound to the ticket"), { status: 502 });
    }
    await this.repository.markPrepared(ticket, {
      providerSessionId: task.sessionId,
      certificateFingerprint,
      toBeSignedSha256: sha256(Buffer.from(task.toBeSignedBase64, "base64")),
    });
    const { toBeSignedBase64, ...publicTask } = task;
    return { ...publicTask, dataToSignBase64: toBeSignedBase64, documentName: ticket.document_name };
  }

  async complete(token, { signatureBase64, certificateFingerprintSha256 }) {
    if (!this.provider) throw Object.assign(new Error("local signing provider is unavailable"), { status: 503 });
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "prepared") throw Object.assign(new Error("ticket is not prepared"), { status: 409 });
    const expectedFingerprint = Buffer.from(ticket.certificate_fingerprint_sha256).toString("hex");
    if (certificateFingerprintSha256 !== expectedFingerprint) throw Object.assign(new Error("certificate binding mismatch"), { status: 409 });
    const result = await this.provider.complete({ sessionId: ticket.provider_session_id, signatureBase64 });
    if (sha256(result.pdf) !== result.signedPdfSha256) throw Object.assign(new Error("signed PDF hash mismatch"), { status: 502 });
    const signedArtifact = await this.artifactStore.put(result.pdf, { extension: "pdf" });
    await this.repository.markCompleted(ticket, { signedArtifact, validation: result.validation });
    return { status: "completed", signedPdfSha256: signedArtifact.sha256, validation: result.validation };
  }

  async result(token) {
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "completed") throw Object.assign(new Error("signed PDF is not available"), { status: 409 });
    return { bytes: await this.artifactStore.get(ticket.signed_pdf_storage_key), name: ticket.document_name.replace(/\.pdf$/i, "-assinado.pdf") };
  }
}

export function bearerToken(request) {
  const value = request.headers.authorization;
  const match = typeof value === "string" ? value.match(/^Bearer ([A-Za-z0-9_-]{43})$/) : null;
  if (!match) throw Object.assign(new Error("ticket authorization is required"), { status: 401 });
  return match[1];
}
