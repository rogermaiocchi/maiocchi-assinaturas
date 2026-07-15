import { createPrivateKey, createPublicKey, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { readdir, readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { FileArtifactStore } from "./artifact-store.mjs";
import { assertPublicId, verifyAuthenticityEnvelope } from "./authenticity-contract.mjs";
import { applyMigrations, PostgresAuthenticityRepository } from "./authenticity-repository.mjs";
import { registerGoldStandardDocument } from "./authenticity-service.mjs";
import { signInternalResponse, verifyInternalRequest } from "./internal-auth.mjs";
import { MemoryInternalReplayGuard, PostgresInternalReplayGuard } from "./internal-replay-guard.mjs";
import { PrivatePadesProviderClient } from "./private-pades-provider-client.mjs";
import { PostgresPrivateSigningRepository } from "./private-signing-repository.mjs";
import { bearerToken, PrivateSigningService } from "./private-signing-service.mjs";
import { createPostQuantumKeyring, createPostQuantumSigner, postQuantumKeyId } from "./post-quantum-evidence.mjs";
import { RestPkiCoreClient } from "./rest-pki-core-client.mjs";

const JSON_TYPE = "application/json; charset=utf-8";
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SERVICE_VERSION = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;

function responseHeaders(extra = {}) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  };
}

function sendJson(response, status, value, extra = {}) {
  response.writeHead(status, responseHeaders({ "content-type": JSON_TYPE, ...extra }));
  response.end(JSON.stringify(value));
}

function sendProblem(response, status, code, message, extra = {}) {
  sendJson(response, status, { error: { code, message } }, extra);
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function publicIdFromPath(pathname, prefix, suffix = "") {
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const end = suffix ? -suffix.length : undefined;
  const value = decodeURIComponent(pathname.slice(prefix.length, end));
  if (!value || value.includes("/")) return null;
  try {
    return assertPublicId(value);
  } catch {
    return null;
  }
}

function contentDisposition(filename) {
  return `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "-")}"`;
}

function keyIdFromPath(pathname) {
  if (!pathname.startsWith("/chaves/") || !pathname.endsWith(".pem")) return null;
  const value = decodeURIComponent(pathname.slice(8, -4));
  return KEY_ID_PATTERN.test(value) ? value : null;
}

function pqcKeyIdFromPath(pathname) {
  if (!pathname.startsWith("/chaves-pqc/") || !pathname.endsWith(".pem")) return null;
  const value = decodeURIComponent(pathname.slice(12, -4));
  return KEY_ID_PATTERN.test(value) ? value : null;
}

function normalizeIp(value) {
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("::ffff:") ? value.slice(7) : value;
  return net.isIP(normalized) ? normalized : null;
}

function isTrustedProxyPeer(value) {
  const address = normalizeIp(value);
  if (!address) return false;
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (net.isIPv4(address)) {
    const [first, second] = address.split(".").map(Number);
    return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168) || (first === 169 && second === 254);
  }
  return false;
}

function observedClientIp(request) {
  const peer = normalizeIp(request.socket?.remoteAddress);
  if (!isTrustedProxyPeer(peer)) return peer || "Não fornecido";
  const forwarded = typeof request.headers["x-forwarded-for"] === "string"
    ? request.headers["x-forwarded-for"].split(",").map((value) => value.trim()).filter(Boolean) : [];
  const candidates = [...forwarded.reverse(), peer].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) return normalized;
  }
  return "Não fornecido";
}

async function loadPublicKeys(directory, initialKeys = []) {
  const keys = new Map(initialKeys);
  let files;
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return keys;
    throw error;
  }
  for (const filename of files.filter((name) => name.endsWith(".pub.pem")).sort()) {
    const keyId = filename.slice(0, -8);
    if (!KEY_ID_PATTERN.test(keyId)) throw new Error(`invalid public key filename: ${filename}`);
    const key = createPublicKey(await readFile(path.join(directory, filename)));
    if (key.asymmetricKeyType !== "ed25519") throw new Error(`public key is not Ed25519: ${filename}`);
    keys.set(keyId, key);
  }
  return keys;
}

export async function loadValidatorKeys(directory) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(directory, "keyring.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
  if (manifest?.version !== 1 || !Array.isArray(manifest.keys)) throw new Error("validator keyring manifest is invalid");
  const keys = new Map();
  for (const entry of manifest.keys) {
    const { keyId, status, notBefore, notAfter } = entry || {};
    if (!KEY_ID_PATTERN.test(keyId || "") || !["active", "retired", "revoked"].includes(status)) {
      throw new Error("validator keyring entry is invalid");
    }
    for (const value of [notBefore, notAfter]) {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("validator key validity is invalid");
    }
    if (new Date(notBefore) >= new Date(notAfter)) throw new Error("validator key validity interval is invalid");
    const key = createPublicKey(await readFile(path.join(directory, `${keyId}.pub.pem`)));
    if (key.asymmetricKeyType !== "ed25519") throw new Error(`validator key is not Ed25519: ${keyId}`);
    if (keys.has(keyId)) throw new Error(`duplicate validator key ID: ${keyId}`);
    keys.set(keyId, { key, status, notBefore, notAfter });
  }
  return keys;
}

export async function loadPostQuantumPublicKeys(directory) {
  const keys = new Map();
  if (!directory) return keys;
  let files;
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return keys;
    throw error;
  }
  for (const filename of files.filter((name) => name.endsWith(".pub.pem")).sort()) {
    const keyId = filename.slice(0, -8);
    if (!KEY_ID_PATTERN.test(keyId)) throw new Error(`invalid post-quantum public key filename: ${filename}`);
    const key = createPublicKey(await readFile(path.join(directory, filename)));
    if (key.asymmetricKeyType !== "ml-dsa-65" || postQuantumKeyId(key) !== keyId) {
      throw new Error(`post-quantum public key filename does not match its fingerprint: ${filename}`);
    }
    if (keys.has(keyId)) throw new Error(`duplicate post-quantum public key ID: ${keyId}`);
    keys.set(keyId, key);
  }
  return keys;
}

export async function readConfiguredSecret(value, file, label) {
  if (value && file) throw new Error(`${label} must use either an environment value or a secret file`);
  const secret = file ? (await readFile(file, "utf8")).trim() : value;
  if (!secret || secret.length < 32) throw new Error(`${label} is not configured securely`);
  return secret;
}

export function requiresPrivateSigningEvidenceKey({ providerEndpoint, remoteProvider, localSigningEnabled }) {
  return Boolean(remoteProvider || (providerEndpoint && localSigningEnabled));
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function listenServer(server, port, host) {
  return new Promise((resolve, reject) => {
    const failed = (error) => {
      server.off("listening", listening);
      reject(error);
    };
    const listening = () => {
      server.off("error", failed);
      resolve();
    };
    server.once("error", failed);
    server.once("listening", listening);
    server.listen(port, host);
  });
}

export async function listenAtomically(listeners) {
  if (!Array.isArray(listeners) || listeners.length === 0) throw new TypeError("listeners are required");
  try {
    await Promise.all(listeners.map(({ server, port, host }) => listenServer(server, port, host)));
  } catch (error) {
    await Promise.allSettled(listeners.map(({ server }) => closeServer(server)));
    throw error;
  }
}

export function createRequestHandler({
  repository,
  artifactStore,
  privateKey,
  publicKey,
  keyId,
  verificationKeys,
  validatorKeys,
  allowedPolicyOids = new Set(),
  allowPublicDisclosure = false,
  internalHmacKey,
  baseUrl = "https://assinatura.maiocchi.adv.br",
  allowedOrigins = [],
  maxBodyBytes = 40 * 1024 * 1024,
  healthCheck = async () => true,
  privateSigningService = null,
  replayGuard = new MemoryInternalReplayGuard(),
  surface = "combined",
}) {
  if (!["public", "internal", "combined"].includes(surface)) throw new TypeError("request surface is invalid");
  const baseOrigin = new URL(baseUrl).origin;
  const permittedOrigins = new Set([baseOrigin, ...allowedOrigins.map((value) => new URL(value).origin)]);
  const trustedVerificationKeys = verificationKeys || new Map([[keyId, publicKey]]);
  const trustedValidatorKeys = validatorKeys || new Map();
  const internalPdfBodyLimit = Math.ceil(maxBodyBytes * 4 / 3) + (1024 * 1024);

  return async function handle(request, response) {
    let internalRequestAuth = null;
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : null;
    const corsHeaders = requestOrigin && permittedOrigins.has(requestOrigin)
      ? { "access-control-allow-origin": requestOrigin, vary: "Origin" }
      : { vary: "Origin" };
    const headers = (extra = {}) => responseHeaders({ ...corsHeaders, ...extra });
    const json = (status, value, extra = {}) => sendJson(response, status, value, { ...corsHeaders, ...extra });
    const problem = (status, code, message) => sendProblem(response, status, code, message, corsHeaders);
    const internalJson = (status, value) => {
      if (!internalRequestAuth) throw Object.assign(new Error("internal response authentication is unavailable"), { status: 500 });
      const body = Buffer.from(JSON.stringify(value), "utf8");
      const signature = signInternalResponse({ secret: internalHmacKey, requestAuth: internalRequestAuth, status, rawBody: body });
      response.writeHead(status, headers({
        "content-type": JSON_TYPE,
        "x-maiocchi-response-signature": signature,
      }));
      response.end(body);
    };
    const authenticateInternal = async (rawBody, url) => {
      const auth = verifyInternalRequest({
        header: request.headers["x-maiocchi-signature"],
        secret: internalHmacKey,
        rawBody,
        method: request.method,
        target: `${url.pathname}${url.search}`,
      });
      if (!auth) return false;
      internalRequestAuth = auth;
      if (!(await replayGuard.consume(auth))) {
        throw Object.assign(new Error("Requisição interna repetida ou já processada."), { status: 409, code: "request_replayed" });
      }
      return true;
    };

    try {
      const url = new URL(request.url, baseUrl);
      const internalPath = url.pathname.startsWith("/internal/");
      if ((surface === "public" && internalPath) ||
          (surface === "internal" && !internalPath && url.pathname !== "/healthz")) {
        return problem(404, "not_found", "Rota não encontrada.");
      }
      if (request.method === "OPTIONS") {
        if (!requestOrigin || !permittedOrigins.has(requestOrigin)) {
          return problem(403, "origin_not_allowed", "Origem não autorizada.");
        }
        response.writeHead(204, headers({
          "access-control-allow-headers": "accept, authorization, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-max-age": "600",
        }));
        return response.end();
      }
      if (request.method === "GET" && url.pathname === "/healthz") {
        await healthCheck();
        const remoteHealth = privateSigningService
          ? privateSigningService.remoteSigningStatus()
          : { ready: false, provider: null };
        return json(200, {
          status: "ok",
          service: "pki-bridge",
          version: SERVICE_VERSION,
          privatePadesProvider: privateSigningService?.provider ? "ready" : "disabled",
          localA3Signing: privateSigningService?.localSigningEnabled ? "ready" : "disabled",
          remoteSigning: remoteHealth.ready ? "ready" : privateSigningService?.remoteProvider ? "unavailable" : "disabled",
          remoteSigningProvider: remoteHealth.provider,
          postQuantumEvidence: privateSigningService ? "ml-dsa-65" : "disabled",
          artifactEncryption: artifactStore.encryptedAtRest ? "aes-256-gcm" : "disabled",
        });
      }

      if (url.pathname === "/api/pades/ticket" && request.method === "GET") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        return json(200, await privateSigningService.status(bearerToken(request)));
      }

      if (url.pathname === "/api/pades/prepare" && request.method === "POST") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        const raw = await readBody(request, 2 * 1024 * 1024);
        const body = JSON.parse(raw.toString("utf8"));
        return json(201, await privateSigningService.prepare(bearerToken(request), {
          ...body, observedIp: observedClientIp(request),
        }));
      }

      if (url.pathname === "/api/pades/complete" && request.method === "POST") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        const raw = await readBody(request, 1024 * 1024);
        return json(200, await privateSigningService.complete(bearerToken(request), JSON.parse(raw.toString("utf8"))));
      }

      if (url.pathname === "/api/pades/result" && request.method === "GET") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        const result = await privateSigningService.result(bearerToken(request));
        response.writeHead(200, headers({
          "content-type": "application/pdf",
          "content-length": String(result.bytes.length),
          "content-disposition": contentDisposition(result.name),
          "x-document-verification-id": result.publicId,
        }));
        return response.end(result.bytes);
      }

      if (url.pathname === "/api/pades/remote/session" && request.method === "POST") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Serviço de assinatura indisponível.");
        const raw = await readBody(request, 16 * 1024);
        const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
        return json(201, await privateSigningService.startRemote(bearerToken(request), {
          clientMetadata: body.clientMetadata,
          observedIp: observedClientIp(request),
        }));
      }

      if (url.pathname === "/api/pades/remote/complete" && request.method === "POST") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Serviço de assinatura indisponível.");
        const raw = await readBody(request, 4096);
        return json(200, await privateSigningService.completeRemote(bearerToken(request), JSON.parse(raw.toString("utf8"))));
      }
      const requestedKeyId = keyIdFromPath(url.pathname);
      if (request.method === "GET" && requestedKeyId) {
        const requestedKey = trustedVerificationKeys.get(requestedKeyId);
        if (!requestedKey) return problem(404, "not_found", "Chave pública não encontrada.");
        const pem = requestedKey.export({ type: "spki", format: "pem" });
        response.writeHead(200, headers({ "content-type": "application/x-pem-file; charset=utf-8" }));
        return response.end(pem);
      }
      const requestedPqcKeyId = pqcKeyIdFromPath(url.pathname);
      if (request.method === "GET" && requestedPqcKeyId) {
        const requestedKey = privateSigningService?.postQuantumSigner.publicKeys?.get(requestedPqcKeyId);
        if (!requestedKey) {
          return problem(404, "not_found", "Chave pública pós-quântica não encontrada.");
        }
        const pem = requestedKey.export({ type: "spki", format: "pem" });
        response.writeHead(200, headers({ "content-type": "application/x-pem-file; charset=utf-8" }));
        return response.end(pem);
      }

      const redirectId = publicIdFromPath(url.pathname, "/v/");
      if (request.method === "GET" && redirectId) {
        response.writeHead(302, headers({ location: `/validar?codigo=${encodeURIComponent(redirectId)}` }));
        return response.end();
      }

      const verificationId = publicIdFromPath(url.pathname, "/verificacao/");
      if (request.method === "GET" && verificationId) {
        const entry = await repository.findByPublicId(verificationId);
        if (entry) {
          const verificationKey = trustedVerificationKeys.get(entry.envelope?.proof?.keyId);
          if (!verificationKey || !verifyAuthenticityEnvelope(entry.envelope, verificationKey)) {
            return problem(503, "evidence_invalid", "O registro de autenticidade não passou na verificação interna.");
          }
          return json(200, { documentStatus: entry.status, proofVerified: true, envelope: entry.envelope });
        }
        const privateVerification = privateSigningService ? await privateSigningService.verification(verificationId) : null;
        if (!privateVerification) return problem(404, "not_found", "Documento não encontrado.");
        return json(200, privateVerification);
      }

      const sheetId = publicIdFromPath(url.pathname, "/folha/", ".pdf");
      if (request.method === "GET" && sheetId) {
        const entry = await repository.findByPublicId(sheetId);
        const bytes = entry
          ? await artifactStore.get(entry.representation_storage_key)
          : privateSigningService ? await privateSigningService.evidencePage(sheetId) : null;
        if (!bytes) return problem(404, "not_found", "Documento não encontrado.");
        response.writeHead(200, headers({
          "content-type": "application/pdf",
          "content-length": String(bytes.length),
          "content-disposition": contentDisposition(`folha-autenticidade-${sheetId}.pdf`),
        }));
        return response.end(bytes);
      }

      const originalId = publicIdFromPath(url.pathname, "/original/", ".pdf");
      if (request.method === "GET" && originalId) {
        const entry = await repository.findByPublicId(originalId);
        if (!entry) return problem(404, "not_found", "Documento não encontrado.");
        if (entry.disclosure_mode !== "public") {
          return problem(403, "restricted", "O documento original exige autorização adicional.");
        }
        const bytes = await artifactStore.get(entry.original_storage_key);
        response.writeHead(200, headers({
          "content-type": "application/pdf",
          "content-length": String(bytes.length),
          "content-disposition": contentDisposition(`documento-eletronico-${originalId}.pdf`),
        }));
        return response.end(bytes);
      }

      if (request.method === "POST" && url.pathname === "/internal/authenticity/records") {
        const raw = await readBody(request, internalPdfBodyLimit);
        if (!(await authenticateInternal(raw, url))) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        const body = JSON.parse(raw.toString("utf8"));
        const result = await registerGoldStandardDocument({
          workflowId: body.workflowId,
          revision: body.revision,
          signedPdf: Buffer.from(body.signedPdfBase64 || "", "base64"),
          validationReport: body.validationReport,
          validation: body.validation,
          validationAttestation: body.validationAttestation,
          finalizedAt: body.finalizedAt,
          disclosureMode: body.disclosureMode,
          documentContext: body.documentContext,
        }, {
          repository,
          artifactStore,
          privateKey,
          keyId,
          validatorKeys: trustedValidatorKeys,
          allowedPolicyOids,
          allowPublicDisclosure,
          baseUrl,
        });
        return internalJson(result.replayed ? 200 : 201, {
          publicId: result.publicId,
          envelope: result.envelope,
          replayed: Boolean(result.replayed),
        });
      }

      if (request.method === "POST" && url.pathname === "/internal/evidence/compose") {
        const raw = await readBody(request, internalPdfBodyLimit);
        if (!(await authenticateInternal(raw, url))) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        if (!privateSigningService) return internalJson(503, { error: { code: "provider_unavailable", message: "Compositor privado de evidências indisponível." } });
        const body = JSON.parse(raw.toString("utf8"));
        const result = await privateSigningService.composeEvidence({
          pdf: Buffer.from(body.pdfBase64 || "", "base64"),
          publicId: body.publicId,
          documentNumber: body.documentNumber,
          documentName: body.documentName,
          documentContext: body.documentContext,
          signingMetadata: body.signingMetadata,
        });
        return internalJson(200, {
          presentationPdfBase64: result.presentation.toString("base64"),
          evidencePagePdfBase64: result.evidencePage.toString("base64"),
          manifest: result.manifest,
          attestation: result.attestation,
          totalPages: result.totalPages,
          verificationUrl: result.verificationUrl,
          barcodeValue: result.barcodeValue,
        });
      }

      if (request.method === "POST" && url.pathname === "/internal/evidence/verify") {
        const raw = await readBody(request, 1024 * 1024);
        if (!(await authenticateInternal(raw, url))) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        if (!privateSigningService) return internalJson(503, { error: { code: "provider_unavailable", message: "Verificador privado de evidências indisponível." } });
        const body = JSON.parse(raw.toString("utf8"));
        return internalJson(200, privateSigningService.verifyEvidence(body.manifest, body.attestation));
      }

      if (request.method === "POST" && url.pathname === "/internal/evidence/finalize") {
        const raw = await readBody(request, 2 * 1024 * 1024);
        if (!(await authenticateInternal(raw, url))) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        if (!privateSigningService) return internalJson(503, { error: { code: "provider_unavailable", message: "Finalizador privado de evidências indisponível." } });
        const body = JSON.parse(raw.toString("utf8"));
        return internalJson(200, privateSigningService.finalizeEvidence({
          manifest: body.manifest,
          attestation: body.attestation,
          finalPdfSha256: body.finalPdfSha256,
          finalPdfSize: body.finalPdfSize,
          finalizedAt: body.finalizedAt,
        }));
      }

      if (request.method === "POST" && url.pathname === "/internal/pades/tickets") {
        const raw = await readBody(request, internalPdfBodyLimit);
        if (!(await authenticateInternal(raw, url))) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        if (!privateSigningService) return internalJson(503, { error: { code: "provider_unavailable", message: "Provider PAdES privado indisponível." } });
        const body = JSON.parse(raw.toString("utf8"));
        const result = await privateSigningService.createTicket({
          pdf: Buffer.from(body.pdfBase64 || "", "base64"),
          documentName: body.documentName,
          documentContext: body.documentContext,
          ttlSeconds: body.ttlSeconds,
        });
        return internalJson(201, result);
      }

      if (request.method === "POST" && url.pathname === "/internal/pades/commit") {
        const raw = await readBody(request, 4096);
        if (!(await authenticateInternal(raw, url))) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        if (!privateSigningService) {
          return internalJson(503, { error: { code: "provider_unavailable", message: "Provider PAdES privado indisponível." } });
        }
        const body = JSON.parse(raw.toString("utf8"));
        return internalJson(200, await privateSigningService.commitPayload(body.ticket));
      }

      return problem(404, "not_found", "Rota não encontrada.");
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : error instanceof SyntaxError || error instanceof TypeError ? 400 : 500;
      const message = status >= 500 ? "O serviço não conseguiu concluir a operação." : error.message;
      if (internalRequestAuth) {
        return internalJson(status, { error: { code: error.code || (status >= 500 ? "internal_error" : "invalid_request"), message } });
      }
      return problem(status, status >= 500 ? "internal_error" : "invalid_request", message);
    }
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const artifactRoot = process.env.ARTIFACT_ROOT || "/data/artifacts";
  const artifactEncryptionKeyFile = process.env.ARTIFACT_ENCRYPTION_KEY_FILE;
  const keyFile = process.env.AUTHENTICITY_PRIVATE_KEY_FILE;
  const internalHmacKey = await readConfiguredSecret(
    process.env.AUTHENTICITY_INTERNAL_HMAC_KEY,
    process.env.AUTHENTICITY_INTERNAL_HMAC_KEY_FILE,
    "internal HMAC key",
  );
  if (!databaseUrl || !keyFile || !artifactEncryptionKeyFile) {
    throw new Error("pki-bridge configuration is incomplete");
  }

  const privateKey = createPrivateKey(await readFile(keyFile));
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const keyId = process.env.AUTHENTICITY_KEY_ID || `ed25519-${createHash("sha256").update(publicDer).digest("hex").slice(0, 16)}`;
  if (!KEY_ID_PATTERN.test(keyId)) throw new Error("AUTHENTICITY_KEY_ID is invalid");
  const verificationKeys = await loadPublicKeys(process.env.AUTHENTICITY_PUBLIC_KEYS_DIR || path.dirname(keyFile), [[keyId, publicKey]]);
  const validatorKeys = await loadValidatorKeys(process.env.VALIDATOR_PUBLIC_KEYS_DIR || "/run/validator-keys");
  const pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  await applyMigrations(pool);
  const repository = new PostgresAuthenticityRepository(pool);
  const artifactStore = new FileArtifactStore(artifactRoot, {
    encryptionKey: await readFile(artifactEncryptionKeyFile),
    requireEncryption: true,
  });
  const providerEndpoint = process.env.PRIVATE_PADES_PROVIDER_URL;
  const providerApiKey = process.env.PRIVATE_PADES_PROVIDER_API_KEY;
  if (Boolean(providerEndpoint) !== Boolean(providerApiKey)) throw new Error("private PAdES provider configuration is incomplete");
  const remoteConfiguration = [
    process.env.REST_PKI_CORE_ENDPOINT,
    process.env.REST_PKI_CORE_API_KEY,
    process.env.REST_PKI_CORE_SECURITY_CONTEXT_ID,
  ];
  const configuredRemoteValues = remoteConfiguration.filter((value) => typeof value === "string" && value.trim() !== "");
  if (configuredRemoteValues.length > 0 && configuredRemoteValues.length !== remoteConfiguration.length) {
    throw new Error("remote signing provider configuration is incomplete");
  }
  const remoteProvider = configuredRemoteValues.length === remoteConfiguration.length ? new RestPkiCoreClient({
    endpoint: remoteConfiguration[0],
    apiKey: remoteConfiguration[1],
    securityContextId: remoteConfiguration[2],
    redirectOrigins: (process.env.REST_PKI_CORE_REDIRECT_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
  }) : null;
  const localSigningEnabled = process.env.ENABLE_LOCAL_A3_SIGNING === "true";
  const postQuantumKeyFile = process.env.AUTHENTICITY_ML_DSA_PRIVATE_KEY_FILE;
  if (!postQuantumKeyFile && requiresPrivateSigningEvidenceKey({ providerEndpoint, remoteProvider, localSigningEnabled })) {
    throw new Error("ML-DSA-65 evidence key configuration is incomplete");
  }
  const postQuantumSigner = postQuantumKeyFile ? createPostQuantumKeyring(
    createPostQuantumSigner(createPrivateKey(await readFile(postQuantumKeyFile)), process.env.AUTHENTICITY_ML_DSA_KEY_ID),
    await loadPostQuantumPublicKeys(process.env.AUTHENTICITY_ML_DSA_PUBLIC_KEYS_DIR),
  ) : null;
  const allowedPolicyOids = new Set((process.env.PADES_ALLOWED_POLICY_OIDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  const privateSigningService = postQuantumSigner ? new PrivateSigningService({
    repository: new PostgresPrivateSigningRepository(pool),
    artifactStore,
    provider: providerEndpoint ? new PrivatePadesProviderClient({
      endpoint: providerEndpoint,
      apiKey: providerApiKey,
      allowInsecureInternal: process.env.PRIVATE_PADES_ALLOW_INTERNAL_HTTP === "true",
    }) : null,
    remoteProvider,
    localSigningEnabled,
    postQuantumSigner,
    allowedPolicyOids,
    baseUrl: process.env.PUBLIC_BASE_URL || "https://assinatura.maiocchi.adv.br",
  }) : null;
  const replayGuard = new PostgresInternalReplayGuard(pool);
  const handlerOptions = {
    repository,
    artifactStore,
    privateKey,
    publicKey,
    keyId,
    verificationKeys,
    validatorKeys,
    allowedPolicyOids,
    allowPublicDisclosure: process.env.ALLOW_PUBLIC_ORIGINALS === "true",
    internalHmacKey,
    baseUrl: process.env.PUBLIC_BASE_URL || "https://assinatura.maiocchi.adv.br",
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
    healthCheck: () => pool.query("SELECT 1"),
    privateSigningService,
    replayGuard,
  };
  const port = Number(process.env.PORT || 3400);
  const internalPort = Number(process.env.INTERNAL_PORT || 3401);
  const internalHost = process.env.INTERNAL_BIND_HOST || "pki-bridge-internal";
  if (!Number.isInteger(port) || !Number.isInteger(internalPort) || port < 1 || internalPort < 1 || port === internalPort) {
    throw new Error("public and internal listener ports are invalid");
  }
  const internalAddress = (await lookup(internalHost, { family: 4 })).address;
  if (privateSigningService) await privateSigningService.remoteSigningHealth();
  const publicServer = http.createServer(createRequestHandler({ ...handlerOptions, surface: "public" }));
  const internalServer = http.createServer(createRequestHandler({ ...handlerOptions, surface: "internal" }));
  await listenAtomically([
    { server: publicServer, port, host: "0.0.0.0" },
    { server: internalServer, port: internalPort, host: internalAddress },
  ]);
  const shutdown = () => {
    let open = 2;
    const closed = () => { if (--open === 0) pool.end(); };
    publicServer.close(closed);
    internalServer.close(closed);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
