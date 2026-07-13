import { createHash, randomBytes, randomInt } from "node:crypto";
import { canonicalize, generatePublicId } from "./authenticity-contract.mjs";
import { buildEvidenceManifest, composePadesEvidence, inspectUnsignedPdf } from "./pades-evidence.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ICP_BRASIL_SIGNER_ROLE = "Signatário ICP-Brasil";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function certificateFingerprint(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_500_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw Object.assign(new Error("certificate is invalid"), { status: 400 });
  }
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.toString("base64") !== value) {
    throw Object.assign(new Error("certificate is invalid"), { status: 400 });
  }
  return sha256(bytes);
}

function safeName(value) {
  let name = typeof value === "string" && value.trim() ? value.trim() : "documento.pdf";
  name = name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120);
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function safeDisplay(value, fallback, max = 180) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : fallback;
}

function safeDocumentContext(value) {
  const context = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const generatedBy = context.generatedBy && typeof context.generatedBy === "object" && !Array.isArray(context.generatedBy)
    ? context.generatedBy : {};
  return {
    generatedBy: {
      name: safeDisplay(generatedBy.name, "Roger Maiocchi", 120),
      nationalIdMasked: safeDisplay(generatedBy.nationalIdMasked, "006.***.***-40", 40),
      professionalRegistration: safeDisplay(generatedBy.professionalRegistration, "OAB/DF 31.249", 40),
    },
    intendedFor: safeDisplay(context.intendedFor, "Não informado"),
    purpose: safeDisplay(context.purpose, "Documento eletrônico"),
  };
}

function normalizeGeolocation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const accuracyMeters = Number(value.accuracyMeters ?? value.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100_000) return null;
  return { latitude, longitude, accuracyMeters };
}

function normalizeSigningMetadata(value, { observedIp, modality }) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const screen = metadata.screen && typeof metadata.screen === "object"
    ? `${Number(metadata.screen.width) || 0}x${Number(metadata.screen.height) || 0}` : "";
  const platform = [safeDisplay(metadata.platform, "Não fornecida", 100), screen].filter(Boolean).join(" · ");
  return {
    observedIp: safeDisplay(observedIp, "Não fornecido", 80),
    platform,
    userAgent: safeDisplay(metadata.userAgent, "Não fornecido", 300),
    timezone: safeDisplay(metadata.timezone, "Não fornecido", 80),
    locale: safeDisplay(metadata.locale, "Não fornecido", 40),
    geolocation: normalizeGeolocation(metadata.geolocation),
    capturedAt: new Date().toISOString(),
    tokenType: modality === "remote"
      ? "Certificado ICP-Brasil em nuvem (PSC)"
      : "Certificado ICP-Brasil A3 / token criptográfico",
    modality,
  };
}

function documentNumber(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  let entropy = "";
  for (let index = 0; index < 15; index += 1) entropy += String(randomInt(0, 10));
  return `${stamp}${entropy}`;
}

function tokenHash(token) {
  if (!TOKEN_PATTERN.test(token || "")) throw Object.assign(new Error("ticket is invalid"), { status: 401 });
  return sha256(token);
}

function assertActive(ticket) {
  if (!ticket || new Date(ticket.expires_at) <= new Date()) throw Object.assign(new Error("ticket expired or not found"), { status: 410 });
}

function bufferHex(value) {
  return value ? Buffer.from(value).toString("hex") : null;
}

function maskNationalId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
  return "Não informado";
}

function remotePolicyOid(signer) {
  return signer?.signaturePolicy?.oid || signer?.policy?.oid || null;
}

function remoteSignerMetadata(signer) {
  const certificate = signer?.certificate || {};
  const signedAt = signer?.signingTime || signer?.claimedSigningTime || new Date().toISOString();
  return {
    name: safeDisplay(certificate.subjectDisplayName || certificate.subjectCommonName, "Signatário identificado no certificado", 140),
    nationalIdMasked: maskNationalId(certificate.pkiBrazil?.cpf || certificate.subjectIdentifier),
    certificateType: safeDisplay(certificate.pkiBrazil?.certificateType, "ICP-Brasil", 80),
    certificateFingerprintSha256: safeDisplay(certificate.thumbprintSHA256, "", 64).toLowerCase(),
    signedAt: Number.isNaN(new Date(signedAt).getTime()) ? new Date().toISOString() : new Date(signedAt).toISOString(),
  };
}

function publicItiAttributes(validation) {
  const profile = validation?.itiAttributes;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const scopes = [
    ["CMS assinado", profile.signedCms],
    ["CMS não assinado", profile.unsignedCms],
    ["Dicionário de assinatura PDF", profile.signatureDictionary],
    ["Dicionários relacionados", profile.relatedDictionaries],
  ];
  const attributes = scopes.flatMap(([scope, values]) => (Array.isArray(values) ? values : []).map((attribute) => ({
    scope,
    identifier: safeDisplay(attribute?.identifier, "Não identificado", 80),
    requirement: safeDisplay(attribute?.requirement, "P", 4),
    present: attribute?.present === true,
    status: safeDisplay(attribute?.status, attribute?.present === true ? "PRESENT" : "NOT_PRESENT", 80),
  })));
  if (!attributes.length) return null;
  return {
    normativeDocument: safeDisplay(profile.normativeDocument, "DOC-ICP-15.03", 120),
    profile: safeDisplay(profile.profile, "PAdES AD-RB", 80),
    attributes,
    prohibitedAbsent: (Array.isArray(profile.prohibitedAbsent) ? profile.prohibitedAbsent : [])
      .map((value) => safeDisplay(value, "", 80)).filter(Boolean),
  };
}

function trustedValidation(ticket) {
  const validation = ticket.validation_report || {};
  if (validation.provider === "rest_pki_core") {
    const signers = validation.inspection?.signers || [];
    return signers.length > 0 && signers.every((signer) => signer?.validationResults?.passed === true);
  }
  return validation.cryptographicIntegrity === true && validation.trusted === true;
}

function buildFinalEvidenceManifest(ticket, signedArtifact, validation, finalizedAt) {
  return {
    schema: "https://assinatura.maiocchi.adv.br/schemas/pades-final-attestation-v1.json",
    version: "1.0.0",
    publicId: ticket.public_id,
    documentNumber: ticket.document_number,
    signedPdf: {
      mediaType: "application/pdf",
      size: signedArtifact.size,
      sha256: signedArtifact.sha256,
    },
    padesValidationSha256: sha256(Buffer.from(canonicalize(validation), "utf8")),
    embeddedManifestSha256: ticket.pqc_attestation.manifestSha256,
    finalizedAt,
  };
}

function finalEvidenceMatches(ticket) {
  const manifest = ticket.final_evidence_manifest;
  if (!manifest || !ticket.final_pqc_attestation) return false;
  const completedAt = new Date(ticket.completed_at);
  if (Number.isNaN(completedAt.getTime())) return false;
  return manifest.publicId === ticket.public_id
    && manifest.documentNumber === ticket.document_number
    && manifest.signedPdf?.sha256 === bufferHex(ticket.signed_pdf_sha256)
    && manifest.signedPdf?.size === Number(ticket.signed_pdf_size)
    && manifest.padesValidationSha256 === sha256(Buffer.from(canonicalize(ticket.validation_report), "utf8"))
    && manifest.embeddedManifestSha256 === ticket.pqc_attestation?.manifestSha256
    && manifest.finalizedAt === completedAt.toISOString();
}

export class PrivateSigningService {
  constructor({ repository, artifactStore, provider = null, remoteProvider = null, postQuantumSigner, allowedPolicyOids = new Set(), baseUrl }) {
    if (!postQuantumSigner?.attest || !postQuantumSigner?.verify || !postQuantumSigner?.keyId) {
      throw new TypeError("ML-DSA-65 evidence signer is required");
    }
    this.repository = repository;
    this.artifactStore = artifactStore;
    this.provider = provider;
    this.remoteProvider = remoteProvider;
    this.postQuantumSigner = postQuantumSigner;
    this.allowedPolicyOids = allowedPolicyOids;
    if (this.remoteProvider && this.allowedPolicyOids.size === 0) {
      throw new TypeError("remote PAdES policy allowlist is required");
    }
    this.baseUrl = new URL(baseUrl);
  }

  async createTicket({ pdf, documentName, documentContext, ttlSeconds = 600 }) {
    if (!Buffer.isBuffer(pdf) || pdf.length < 5 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new TypeError("source PDF is invalid");
    }
    const ttl = Number(ttlSeconds);
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 1800) throw new TypeError("ticket TTL is invalid");
    const token = randomBytes(32).toString("base64url");
    const sourceArtifact = await this.artifactStore.put(pdf, { extension: "pdf" });
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const publicId = generatePublicId();
    const number = documentNumber();
    await this.repository.create({
      tokenHash: sha256(token), documentName: safeName(documentName), sourceArtifact, expiresAt,
      publicId, documentNumber: number, documentContext: safeDocumentContext(documentContext),
    });
    const url = new URL("/assinar-icp", this.baseUrl);
    url.hash = `ticket=${token}`;
    return { url: url.toString(), expiresAt, sourcePdfSha256: sourceArtifact.sha256, publicId, documentNumber: number };
  }

  async status(token) {
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    return {
      status: ticket.status,
      documentName: ticket.document_name,
      documentSha256: bufferHex(ticket.source_pdf_sha256),
      presentationSha256: bufferHex(ticket.presentation_pdf_sha256),
      expiresAt: new Date(ticket.expires_at).toISOString(),
      signedPdfSha256: bufferHex(ticket.signed_pdf_sha256),
      publicId: ticket.public_id,
      documentNumber: ticket.document_number,
      postQuantumCode: ticket.pqc_code || null,
      finalPostQuantumCode: ticket.final_pqc_code || null,
      localSigningAvailable: Boolean(this.provider),
      remoteSigningAvailable: Boolean(this.remoteProvider),
    };
  }

  async ensurePresentation(ticket, { clientMetadata, observedIp, modality }) {
    if (ticket.presentation_pdf_storage_key) {
      if (ticket.signing_metadata?.modality !== modality) {
        throw Object.assign(new Error("ticket evidence was prepared for another signing modality"), { status: 409 });
      }
      return { ticket, pdf: await this.artifactStore.get(ticket.presentation_pdf_storage_key) };
    }
    const sourcePdf = await this.artifactStore.get(ticket.source_pdf_storage_key);
    const { pageCount } = await inspectUnsignedPdf(sourcePdf);
    const signingMetadata = normalizeSigningMetadata(clientMetadata, { observedIp, modality });
    const manifest = buildEvidenceManifest({
      publicId: ticket.public_id,
      documentNumber: ticket.document_number,
      documentName: ticket.document_name,
      sourceSha256: bufferHex(ticket.source_pdf_sha256),
      sourceSize: Number(ticket.source_pdf_size),
      sourcePageCount: pageCount,
      createdAt: signingMetadata.capturedAt,
      documentContext: ticket.document_context,
      signingMetadata,
    });
    const attestation = this.postQuantumSigner.attest(manifest);
    const composed = await composePadesEvidence({ sourcePdf, manifest, attestation, baseUrl: this.baseUrl });
    const presentationArtifact = await this.artifactStore.put(composed.presentation, { extension: "pdf" });
    const evidencePageArtifact = await this.artifactStore.put(composed.evidencePage, { extension: "pdf" });
    const preparedTicket = await this.repository.markPresentation(ticket, {
      sourcePageCount: pageCount,
      presentationArtifact,
      presentationPageCount: composed.totalPages,
      evidencePageArtifact,
      manifest,
      attestation,
      signingMetadata,
    });
    return { ticket: preparedTicket, pdf: await this.artifactStore.get(preparedTicket.presentation_pdf_storage_key) };
  }

  async startRemote(token, { clientMetadata, observedIp } = {}) {
    if (!this.remoteProvider) throw Object.assign(new Error("remote signing provider is unavailable"), { status: 503 });
    let ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "pending") throw Object.assign(new Error("ticket is not pending"), { status: 409 });
    if (await this.repository.findRemoteSession(ticket.id)) {
      throw Object.assign(new Error("remote signature session already exists"), { status: 409 });
    }
    const prepared = await this.ensurePresentation(ticket, { clientMetadata, observedIp, modality: "remote" });
    ticket = prepared.ticket;
    const returnUrl = new URL("/assinar-icp/", this.baseUrl).toString();
    const session = await this.remoteProvider.createSignatureSession({
      pdf: prepared.pdf,
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
    const terminalStatus = { UserCancelled: "cancelled", Expired: "expired", ProcessingError: "failed" }[session.status];
    if (terminalStatus) {
      await this.repository.markRemoteTerminal(ticket, { providerSessionId: signatureSessionId, status: terminalStatus });
      return { status: terminalStatus };
    }
    if (session.status !== "Completed") throw Object.assign(new Error("remote signature session is not complete"), { status: 409 });
    try {
      const { pdf } = await this.remoteProvider.signedPdfFromSession(session);
      const inspection = await this.remoteProvider.inspectPdf(pdf);
      const signers = Array.isArray(inspection.signers) ? inspection.signers : [];
      const validationPassed = inspection.success && signers.length > 0 && signers.every((signer) => signer?.validationResults?.passed === true);
      const policyPassed = signers.every((signer) => this.allowedPolicyOids.has(remotePolicyOid(signer)));
      if (!validationPassed || !policyPassed) throw Object.assign(new Error("remote PAdES did not pass policy validation"), { status: 422 });
      const signedArtifact = await this.artifactStore.put(pdf, { extension: "pdf" });
      const validation = { provider: "rest_pki_core", inspection };
      const finalizedAt = new Date().toISOString();
      const finalManifest = buildFinalEvidenceManifest(ticket, signedArtifact, validation, finalizedAt);
      const finalAttestation = this.postQuantumSigner.attest(finalManifest);
      await this.repository.markRemoteCompleted(ticket, {
        providerSessionId: signatureSessionId,
        signedArtifact,
        validation,
        finalManifest,
        finalAttestation,
        finalizedAt,
      });
      return { status: "completed", publicId: ticket.public_id, signedPdfSha256: signedArtifact.sha256, validation: inspection };
    } catch (error) {
      await this.repository.markRemoteTerminal(ticket, {
        providerSessionId: signatureSessionId, status: "failed",
      }).catch(() => undefined);
      throw error;
    }
  }

  async prepare(token, { certificateBase64, chainBase64 = [], clientMetadata, observedIp }) {
    if (!this.provider) throw Object.assign(new Error("local signing provider is unavailable"), { status: 503 });
    let ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status === "prepared") {
      return this.resumePrepared(ticket, { certificateBase64, chainBase64 });
    }
    if (ticket.status !== "pending") throw Object.assign(new Error("ticket is not available for signing"), { status: 409 });
    const prepared = await this.ensurePresentation(ticket, { clientMetadata, observedIp, modality: "local-a3" });
    ticket = prepared.ticket;
    const task = await this.provider.prepare({
      pdf: prepared.pdf, name: ticket.document_name, certificateBase64, chainBase64,
      reason: ticket.document_context?.purpose, signerRole: ICP_BRASIL_SIGNER_ROLE,
    });
    const certificateFingerprint = task.certificateFingerprintSha256;
    const presentationHash = bufferHex(ticket.presentation_pdf_sha256);
    if (task.documentSha256 !== presentationHash || !SHA256_PATTERN.test(certificateFingerprint)) {
      throw Object.assign(new Error("provider task is not bound to the prepared PDF"), { status: 502 });
    }
    await this.repository.markPrepared(ticket, {
      providerSessionId: task.sessionId,
      certificateFingerprint,
      toBeSignedSha256: sha256(Buffer.from(task.toBeSignedBase64, "base64")),
    });
    return this.publicSigningTask(ticket, task);
  }

  async resumePrepared(ticket, { certificateBase64, chainBase64 }) {
    const selectedFingerprint = certificateFingerprint(certificateBase64);
    const expectedFingerprint = bufferHex(ticket.certificate_fingerprint_sha256);
    if (selectedFingerprint !== expectedFingerprint) {
      throw Object.assign(new Error("prepared ticket belongs to another certificate"), { status: 409 });
    }

    let task;
    try {
      task = await this.provider.resume({ sessionId: ticket.provider_session_id });
      this.assertPreparedTask(ticket, task);
    } catch (error) {
      if (!new Set(["session_not_found", "session_expired"]).has(error?.code)) throw error;
      const pdf = await this.artifactStore.get(ticket.presentation_pdf_storage_key);
      task = await this.provider.prepare({
        pdf, name: ticket.document_name, certificateBase64, chainBase64,
        reason: ticket.document_context?.purpose, signerRole: ICP_BRASIL_SIGNER_ROLE,
      });
      this.assertTaskBindings(ticket, task);
      ticket = await this.repository.replacePrepared(ticket, {
        providerSessionId: task.sessionId,
        certificateFingerprint: task.certificateFingerprintSha256,
        toBeSignedSha256: sha256(Buffer.from(task.toBeSignedBase64, "base64")),
      });
    }
    return this.publicSigningTask(ticket, task);
  }

  assertPreparedTask(ticket, task) {
    this.assertTaskBindings(ticket, task);
    if (task.sessionId !== ticket.provider_session_id ||
        sha256(Buffer.from(task.toBeSignedBase64, "base64")) !== bufferHex(ticket.to_be_signed_sha256)) {
      throw Object.assign(new Error("resumed signing task does not match prepared ticket"), { status: 502 });
    }
  }

  assertTaskBindings(ticket, task) {
    if (task.documentSha256 !== bufferHex(ticket.presentation_pdf_sha256) ||
        task.certificateFingerprintSha256 !== bufferHex(ticket.certificate_fingerprint_sha256)) {
      throw Object.assign(new Error("provider task is not bound to the prepared ticket"), { status: 502 });
    }
  }

  publicSigningTask(ticket, task) {
    const presentationHash = bufferHex(ticket.presentation_pdf_sha256);
    const { toBeSignedBase64, ...publicTask } = task;
    return {
      ...publicTask,
      dataToSignBase64: toBeSignedBase64,
      documentName: ticket.document_name,
      documentSha256: presentationHash,
      sourceDocumentSha256: bufferHex(ticket.source_pdf_sha256),
      presentationSha256: presentationHash,
      publicId: ticket.public_id,
    };
  }

  async complete(token, { signatureBase64, certificateFingerprintSha256 }) {
    if (!this.provider) throw Object.assign(new Error("local signing provider is unavailable"), { status: 503 });
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "prepared") throw Object.assign(new Error("ticket is not prepared"), { status: 409 });
    const expectedFingerprint = bufferHex(ticket.certificate_fingerprint_sha256);
    if (certificateFingerprintSha256 !== expectedFingerprint) throw Object.assign(new Error("certificate binding mismatch"), { status: 409 });
    const result = await this.provider.complete({ sessionId: ticket.provider_session_id, signatureBase64 });
    if (sha256(result.pdf) !== result.signedPdfSha256) throw Object.assign(new Error("signed PDF hash mismatch"), { status: 502 });
    if (result.validation?.cryptographicIntegrity !== true || result.validation?.trusted !== true) {
      throw Object.assign(new Error("PAdES did not pass trusted validation"), { status: 422 });
    }
    const signedArtifact = await this.artifactStore.put(result.pdf, { extension: "pdf" });
    const finalizedAt = new Date().toISOString();
    const finalManifest = buildFinalEvidenceManifest(ticket, signedArtifact, result.validation, finalizedAt);
    const finalAttestation = this.postQuantumSigner.attest(finalManifest);
    await this.repository.markCompleted(ticket, {
      signedArtifact, validation: result.validation, finalManifest, finalAttestation, finalizedAt,
    });
    return { status: "completed", publicId: ticket.public_id, signedPdfSha256: signedArtifact.sha256, validation: result.validation };
  }

  async result(token) {
    const ticket = await this.repository.findByTokenHash(tokenHash(token));
    assertActive(ticket);
    if (ticket.status !== "completed") throw Object.assign(new Error("signed PDF is not available"), { status: 409 });
    return {
      bytes: await this.artifactStore.get(ticket.signed_pdf_storage_key),
      name: ticket.document_name.replace(/\.pdf$/i, "-assinado.pdf"),
      publicId: ticket.public_id,
    };
  }

  async verification(publicId) {
    const ticket = await this.repository.findByPublicId(publicId);
    if (!ticket || ticket.status !== "completed") return null;
    const embeddedEvidenceValid = this.postQuantumSigner.verify(ticket.evidence_manifest, ticket.pqc_attestation);
    const finalEvidenceValid = this.postQuantumSigner.verify(ticket.final_evidence_manifest, ticket.final_pqc_attestation);
    if (!embeddedEvidenceValid || !finalEvidenceValid || !finalEvidenceMatches(ticket) || !trustedValidation(ticket)) {
      throw Object.assign(new Error("private PAdES evidence failed internal validation"), { status: 503 });
    }
    const validation = ticket.validation_report || {};
    const remoteSigners = validation.provider === "rest_pki_core" ? (validation.inspection?.signers || []).map(remoteSignerMetadata) : [];
    const localSigner = validation.provider === "rest_pki_core" ? [] : [{
      name: safeDisplay(validation.signedBy, "Signatário identificado no certificado", 140),
      nationalIdMasked: safeDisplay(validation.signerNationalIdMasked, "Não informado", 40),
      certificateType: safeDisplay(validation.certificateType, "ICP-Brasil A3", 80),
      certificateFingerprintSha256: bufferHex(ticket.certificate_fingerprint_sha256) || "",
      signedAt: validation.signingTime || ticket.completed_at,
    }];
    const signers = remoteSigners.length ? remoteSigners : localSigner;
    const policyOid = validation.provider === "rest_pki_core"
      ? remotePolicyOid(validation.inspection.signers[0])
      : validation.policyOid;
    const reportBytes = Buffer.from(canonicalize(validation), "utf8");
    const finalHash = bufferHex(ticket.signed_pdf_sha256);
    const finalizedAt = new Date(ticket.completed_at).toISOString();
    const manifest = ticket.evidence_manifest;
    const verifyUrl = new URL(`/v/${ticket.public_id}`, this.baseUrl).toString();
    return {
      documentStatus: "active",
      proofVerified: true,
      envelope: {
        record: {
          schema: "https://assinatura.maiocchi.adv.br/schemas/private-pades-record-v1.json",
          version: "1.0.0",
          document: {
            id: ticket.public_id, revision: 1, mediaType: "application/pdf", size: Number(ticket.signed_pdf_size),
            name: ticket.document_name, number: ticket.document_number,
            pageCount: Number(ticket.presentation_page_count),
            hash: { algorithm: "SHA-256", value: finalHash }, finalizedAt,
            sourceHash: { algorithm: "SHA-256", value: bufferHex(ticket.source_pdf_sha256) },
          },
          signature: {
            format: "PAdES", infrastructure: "ICP-Brasil", profile: "AD-RB",
            policyOid: policyOid || "Não informado", count: signers.length, docMdp: "valid",
            itiAttributes: publicItiAttributes(validation),
          },
          validation: {
            status: "valid", validatedAt: finalizedAt,
            validator: validation.provider === "rest_pki_core" ? "REST PKI Core" : "Maiocchi PAdES Provider / EU DSS",
            attestation: {
              type: "ML-DSA", algorithm: "ML-DSA-65", keyId: ticket.pqc_key_id,
              scope: "final-pades-record",
              hash: { algorithm: "SHA-256", value: ticket.final_pqc_attestation.manifestSha256 },
            },
            report: { mediaType: "application/json", size: reportBytes.length, hash: { algorithm: "SHA-256", value: sha256(reportBytes) } },
          },
          representation: {
            type: "embedded-evidence-page", mediaType: "application/pdf", size: Number(ticket.evidence_page_size),
            hash: { algorithm: "SHA-256", value: bufferHex(ticket.evidence_page_sha256) },
          },
          goldStandard: {
            barcodeValue: `${ticket.public_id}|${ticket.document_number}`,
            intendedFor: manifest.intendedFor,
            purpose: manifest.purpose,
            signingLocation: manifest.signingEnvironment.geolocation
              ? `${manifest.signingEnvironment.geolocation.latitude}, ${manifest.signingEnvironment.geolocation.longitude}` : "Não fornecida",
            tokenType: manifest.signature.tokenType,
            signatureType: "PAdES AD-RB - ICP-Brasil",
            postQuantumCode: ticket.pqc_code,
            finalPostQuantumCode: ticket.final_pqc_code,
            signers: signers.map((signer) => ({ ...signer, role: "Signatário" })),
          },
          disclosure: { mode: "restricted" },
          links: {
            verify: verifyUrl, original: null,
            print: new URL(`/folha/${ticket.public_id}.pdf`, this.baseUrl).toString(),
            officialValidator: "https://validar.iti.gov.br/",
          },
        },
        proof: {
          type: "ML-DSA", algorithm: "ML-DSA-65", keyId: ticket.pqc_key_id,
          scope: "final-pades-record",
          value: ticket.final_pqc_attestation.signatureBase64url,
        },
      },
    };
  }

  async evidencePage(publicId) {
    const ticket = await this.repository.findByPublicId(publicId);
    if (!ticket?.evidence_page_storage_key || ticket.status !== "completed") return null;
    return this.artifactStore.get(ticket.evidence_page_storage_key);
  }

  async observe(publicId, result) {
    const ticket = await this.repository.findByPublicId(publicId);
    if (!ticket || ticket.status !== "completed") return false;
    await this.repository.event(ticket.id, result === "match" ? "hash_matched" : "hash_mismatched",
      result === "match" ? "success" : "failure", { channel: "browser-local-comparison" });
    return true;
  }
}

export function bearerToken(request) {
  const value = request.headers.authorization;
  const match = typeof value === "string" ? value.match(/^Bearer ([A-Za-z0-9_-]{43})$/) : null;
  if (!match) throw Object.assign(new Error("ticket authorization is required"), { status: 401 });
  return match[1];
}
