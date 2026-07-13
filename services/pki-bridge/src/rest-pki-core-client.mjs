import { createHash } from "node:crypto";
import { PkiConfigurationError, PkiProviderError } from "./errors.mjs";
import { SIGNATURE_BOX } from "./pades-evidence-layout.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REMOTE_FILE_BYTES = 40 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireValue(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PkiConfigurationError(`${name} is required`);
  }
  return value.trim();
}

function endpointUrl(value, allowInsecureLocalhost) {
  const endpoint = new URL(requireValue(value, "REST PKI Core endpoint"));
  const local = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(allowInsecureLocalhost && local)) {
    throw new PkiConfigurationError("REST PKI Core endpoint must use HTTPS");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
  return endpoint;
}

function requireUuid(value, name) {
  const normalized = requireValue(value, name);
  if (!UUID_PATTERN.test(normalized)) throw new PkiConfigurationError(`${name} must be a UUID`);
  return normalized;
}

async function limitedResponseBytes(response, limit = MAX_REMOTE_FILE_BYTES) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new PkiProviderError("Signed PDF exceeds the size limit", { status: 413 });
  if (!response.body?.getReader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > limit) throw new PkiProviderError("Signed PDF exceeds the size limit", { status: 413 });
    return body;
  }
  const chunks = [];
  const reader = response.body.getReader();
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new PkiProviderError("Signed PDF exceeds the size limit", { status: 413 });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function sha256Base64(buffer) {
  return createHash("sha256").update(buffer).digest("base64");
}

function padesSignatureOptions() {
  return {
    reason: "Assinatura eletrônica qualificada ICP-Brasil",
    visualRepresentation: {
      text: {
        fontSize: 8,
        text: "ASSINATURA DIGITAL ICP-BRASIL · PAdES AD-RB\n{{signerName}} · CPF {{signerNationalId}}\nCertificado digital qualificado · atributos PAdES incorporados\nA representação visual não substitui a validação criptográfica",
        includeSigningTime: true,
        horizontalAlign: "Left",
        container: { left: 4, right: 4, top: 4, bottom: 4 },
      },
      position: {
        pageNumber: -1,
        measurementUnits: "PdfPoints",
        manual: { ...SIGNATURE_BOX },
      },
    },
  };
}

export class RestPkiCoreClient {
  constructor({ endpoint, apiKey, securityContextId, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, allowInsecureLocalhost = false }) {
    this.endpoint = endpointUrl(endpoint, allowInsecureLocalhost);
    this.apiKey = requireValue(apiKey, "REST PKI Core API key");
    this.securityContextId = requireUuid(securityContextId, "REST PKI Core security context ID");
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = "POST", body } = {}) {
    const response = await this.fetch(new URL(path, this.endpoint), {
      method,
      headers: {
        "accept": "application/json",
        "accept-language": "pt-BR",
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await responseJson(response);
    if (!response.ok) {
      throw new PkiProviderError(`REST PKI Core request failed (${response.status})`, {
        status: response.status,
        code: typeof data?.code === "string" ? data.code : undefined,
      });
    }
    if (!data || typeof data !== "object") {
      throw new PkiProviderError("REST PKI Core returned an invalid JSON response", { status: response.status });
    }
    return data;
  }

  async preparePdfSignature({ pdf, name, certificate }) {
    if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw new TypeError("pdf must be a non-empty Buffer");
    requireValue(certificate, "signer certificate");

    const result = await this.request("/api/signature", {
      body: {
        file: { content: pdf.toString("base64"), mimeType: "application/pdf", name: name || "documento.pdf" },
        certificate: { content: certificate },
        securityContextId: this.securityContextId,
        signatureType: "Pdf",
        pdfSignatureOptions: padesSignatureOptions(),
      },
    });
    if (!result.success || !result.state || !result.toSignHash?.value || !result.toSignHash?.algorithm) {
      throw new PkiProviderError("REST PKI Core did not prepare the PDF signature", { code: result.failure });
    }
    return {
      state: result.state,
      hash: result.toSignHash.value,
      digestAlgorithm: result.toSignHash.algorithm,
      certificate: result.certificate,
      validationResults: result.validationResults,
    };
  }

  async createSignatureSession({ pdf, name, returnUrl, callbackArgument }) {
    if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw new TypeError("pdf must be a non-empty Buffer");
    const callback = new URL(requireValue(returnUrl, "signature session return URL"));
    if (callback.protocol !== "https:" || callback.hash) {
      throw new PkiConfigurationError("signature session return URL must use HTTPS without a fragment");
    }
    const result = await this.request("/api/signature-sessions", {
      body: {
        returnUrl: callback.toString(),
        callbackArgument: requireValue(callbackArgument, "signature session callback argument"),
        securityContextId: this.securityContextId,
        enableBackgroundProcessing: false,
        disableDownloads: true,
        certificateRequirements: [{ type: "CryptoDevice" }],
        documents: [{
          file: { content: pdf.toString("base64"), mimeType: "application/pdf", name: name || "documento.pdf" },
          signatureType: "Pdf",
          pdfSignatureOptions: padesSignatureOptions(),
        }],
      },
    });
    let redirectUrl;
    try {
      redirectUrl = new URL(result.redirectUrl || "");
    } catch {
      throw new PkiProviderError("REST PKI Core returned an invalid signature session");
    }
    if (!UUID_PATTERN.test(result.sessionId || "") || redirectUrl.protocol !== "https:" || redirectUrl.username || redirectUrl.password || redirectUrl.hash) {
      throw new PkiProviderError("REST PKI Core returned an invalid signature session");
    }
    return { sessionId: result.sessionId, redirectUrl: redirectUrl.toString() };
  }

  async getSignatureSession(sessionId) {
    if (!UUID_PATTERN.test(sessionId || "")) throw new TypeError("signature session ID is invalid");
    const result = await this.request(`/api/signature-sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
    if (result.id !== sessionId || typeof result.status !== "string") {
      throw new PkiProviderError("REST PKI Core returned an invalid signature session result");
    }
    return result;
  }

  async signedPdfFromSession(session) {
    if (session?.status !== "Completed" || !Array.isArray(session.documents) || session.documents.length !== 1) {
      throw new PkiProviderError("REST PKI Core signature session is not complete");
    }
    const signedFile = session.documents[0]?.signedFile;
    const pdf = signedFile?.content
      ? Buffer.from(signedFile.content, "base64")
      : signedFile?.url ? await this.downloadTemporaryFile(signedFile.url) : null;
    if (!pdf?.length || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new PkiProviderError("REST PKI Core did not return a signed PDF");
    }
    return { pdf, name: signedFile.name || "documento-assinado.pdf" };
  }

  async completePdfSignature({ state, signature }) {
    const result = await this.request("/api/signature/completion", {
      body: {
        state: requireValue(state, "signature state"),
        signature: requireValue(signature, "signature value"),
      },
    });
    const signedFile = result.signedFile;
    if (!signedFile?.content && !signedFile?.url) {
      throw new PkiProviderError("REST PKI Core did not return the signed PDF");
    }
    const pdf = signedFile.content
      ? Buffer.from(signedFile.content, "base64")
      : await this.downloadTemporaryFile(signedFile.url);
    if (pdf.length === 0) throw new PkiProviderError("REST PKI Core returned an empty signed PDF");
    return { pdf, sha256: sha256Base64(pdf), name: signedFile.name || "documento-assinado.pdf", document: result };
  }

  async inspectPdf(pdf) {
    if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw new TypeError("pdf must be a non-empty Buffer");
    const result = await this.request("/api/signature-inspection", {
      method: "PUT",
      body: {
        file: { content: pdf.toString("base64"), mimeType: "application/pdf" },
        validate: true,
        securityContextId: this.securityContextId,
        ignoreRevocationStatusUnknown: false,
        trustUncertifiedSigningTime: false,
      },
    });
    if (!result.success) throw new PkiProviderError("REST PKI Core could not inspect the signed PDF", { code: result.failure });
    return result;
  }

  async downloadTemporaryFile(value) {
    const target = new URL(requireValue(value, "signed file URL"));
    if (target.protocol !== "https:" || target.origin !== this.endpoint.origin || target.username || target.password || target.hash) {
      throw new PkiProviderError("REST PKI Core returned a disallowed signed file URL");
    }
    const response = await this.fetch(target, { signal: AbortSignal.timeout(this.timeoutMs), redirect: "error" });
    if (!response.ok) throw new PkiProviderError(`Signed PDF download failed (${response.status})`, { status: response.status });
    return limitedResponseBytes(response);
  }
}
