import { createHash } from "node:crypto";
import { PkiConfigurationError, PkiProviderError } from "./errors.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;

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

export class RestPkiCoreClient {
  constructor({ endpoint, apiKey, securityContextId, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, allowInsecureLocalhost = false }) {
    this.endpoint = endpointUrl(endpoint, allowInsecureLocalhost);
    this.apiKey = requireValue(apiKey, "REST PKI Core API key");
    this.securityContextId = requireValue(securityContextId, "REST PKI Core security context ID");
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
        pdfSignatureOptions: { reason: "Assinatura eletrônica qualificada" },
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
    if (target.protocol !== "https:" || target.hostname !== this.endpoint.hostname) {
      throw new PkiProviderError("REST PKI Core returned a disallowed signed file URL");
    }
    const response = await this.fetch(target, { signal: AbortSignal.timeout(this.timeoutMs), redirect: "error" });
    if (!response.ok) throw new PkiProviderError(`Signed PDF download failed (${response.status})`, { status: response.status });
    return Buffer.from(await response.arrayBuffer());
  }
}
