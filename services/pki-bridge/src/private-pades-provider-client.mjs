import { PkiConfigurationError, PkiProviderError } from "./errors.mjs";

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new PkiConfigurationError(`${name} is required`);
  return value.trim();
}

function providerEndpoint(value, allowInsecureInternal) {
  const endpoint = new URL(required(value, "private PAdES provider endpoint"));
  const internal = endpoint.hostname === "pades-provider" || endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(allowInsecureInternal && internal && endpoint.protocol === "http:")) {
    throw new PkiConfigurationError("private PAdES provider endpoint must use HTTPS or the isolated internal hostname");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
  return endpoint;
}

export class PrivatePadesProviderClient {
  constructor({ endpoint, apiKey, fetchImpl = fetch, timeoutMs = 45_000, allowInsecureInternal = false }) {
    this.endpoint = providerEndpoint(endpoint, allowInsecureInternal);
    this.apiKey = required(apiKey, "private PAdES provider API key");
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, body) {
    const response = await this.fetch(new URL(path, this.endpoint), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "x-provider-key": this.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PkiProviderError("Private PAdES provider request failed", {
        status: response.status,
        code: typeof data?.error?.code === "string" ? data.error.code : undefined,
      });
    }
    if (!data || typeof data !== "object") throw new PkiProviderError("Private PAdES provider returned invalid JSON");
    return data;
  }

  async prepare({ pdf, name, certificateBase64, chainBase64 = [], reason, signerRole }) {
    if (!Buffer.isBuffer(pdf) || pdf.length === 0) throw new TypeError("pdf must be a non-empty Buffer");
    const result = await this.request("/v1/signatures/prepare", {
      pdfBase64: pdf.toString("base64"), name, certificateBase64, chainBase64, reason, signerRole,
    });
    return this.signingTask(result);
  }

  async resume({ sessionId }) {
    const id = encodeURIComponent(required(sessionId, "provider session ID"));
    return this.signingTask(await this.request(`/v1/signatures/${id}/resume`, {}));
  }

  async complete({ sessionId, signatureBase64 }) {
    const result = await this.request(`/v1/signatures/${encodeURIComponent(required(sessionId, "provider session ID"))}/complete`, {
      signatureBase64: required(signatureBase64, "signature"),
    });
    if (!result.signedPdfBase64 || !result.signedPdfSha256 || result.validation?.trusted !== true || result.validation?.cryptographicIntegrity !== true) {
      throw new PkiProviderError("Private PAdES provider did not return a trusted signed PDF");
    }
    return { ...result, pdf: Buffer.from(result.signedPdfBase64, "base64") };
  }

  signingTask(result) {
    if (!result.sessionId || !result.toBeSignedBase64 || result.digestAlgorithm !== "SHA-256" ||
        result.signatureAlgorithm !== "RSA-SHA256" || !result.documentSha256 ||
        !result.certificateFingerprintSha256 || !result.expiresAt) {
      throw new PkiProviderError("Private PAdES provider returned an invalid signing task");
    }
    return result;
  }
}
