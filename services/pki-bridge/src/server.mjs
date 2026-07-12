import { createPrivateKey, createPublicKey, createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { FileArtifactStore } from "./artifact-store.mjs";
import { assertPublicId, verifyAuthenticityEnvelope } from "./authenticity-contract.mjs";
import { applyMigrations, PostgresAuthenticityRepository } from "./authenticity-repository.mjs";
import { registerGoldStandardDocument } from "./authenticity-service.mjs";
import { PrivatePadesProviderClient } from "./private-pades-provider-client.mjs";
import { PostgresPrivateSigningRepository } from "./private-signing-repository.mjs";
import { bearerToken, PrivateSigningService } from "./private-signing-service.mjs";
import { verifyWebhookSignature } from "./webhook.mjs";

const JSON_TYPE = "application/json; charset=utf-8";
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
}) {
  const baseOrigin = new URL(baseUrl).origin;
  const permittedOrigins = new Set([baseOrigin, ...allowedOrigins.map((value) => new URL(value).origin)]);
  const trustedVerificationKeys = verificationKeys || new Map([[keyId, publicKey]]);
  const trustedValidatorKeys = validatorKeys || new Map();

  return async function handle(request, response) {
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : null;
    const corsHeaders = requestOrigin && permittedOrigins.has(requestOrigin)
      ? { "access-control-allow-origin": requestOrigin, vary: "Origin" }
      : { vary: "Origin" };
    const headers = (extra = {}) => responseHeaders({ ...corsHeaders, ...extra });
    const json = (status, value, extra = {}) => sendJson(response, status, value, { ...corsHeaders, ...extra });
    const problem = (status, code, message) => sendProblem(response, status, code, message, corsHeaders);

    try {
      const url = new URL(request.url, baseUrl);
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
        return json(200, { status: "ok", privatePadesProvider: privateSigningService ? "ready" : "disabled" });
      }

      if (url.pathname === "/api/pades/ticket" && request.method === "GET") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        return json(200, await privateSigningService.status(bearerToken(request)));
      }

      if (url.pathname === "/api/pades/prepare" && request.method === "POST") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        const raw = await readBody(request, 2 * 1024 * 1024);
        return json(201, await privateSigningService.prepare(bearerToken(request), JSON.parse(raw.toString("utf8"))));
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
        }));
        return response.end(result.bytes);
      }
      const requestedKeyId = keyIdFromPath(url.pathname);
      if (request.method === "GET" && requestedKeyId) {
        const requestedKey = trustedVerificationKeys.get(requestedKeyId);
        if (!requestedKey) return problem(404, "not_found", "Chave pública não encontrada.");
        const pem = requestedKey.export({ type: "spki", format: "pem" });
        response.writeHead(200, headers({ "content-type": "application/x-pem-file; charset=utf-8" }));
        return response.end(pem);
      }

      const redirectId = publicIdFromPath(url.pathname, "/v/");
      if (request.method === "GET" && redirectId) {
        response.writeHead(302, headers({ location: `/validar/?codigo=${encodeURIComponent(redirectId)}` }));
        return response.end();
      }

      const verificationId = publicIdFromPath(url.pathname, "/verificacao/");
      if (request.method === "GET" && verificationId) {
        const entry = await repository.findByPublicId(verificationId);
        if (!entry) return problem(404, "not_found", "Documento não encontrado.");
        const verificationKey = trustedVerificationKeys.get(entry.envelope?.proof?.keyId);
        if (!verificationKey || !verifyAuthenticityEnvelope(entry.envelope, verificationKey)) {
          return problem(503, "evidence_invalid", "O registro de autenticidade não passou na verificação interna.");
        }
        return json(200, { documentStatus: entry.status, proofVerified: true, envelope: entry.envelope });
      }

      const eventId = publicIdFromPath(url.pathname, "/verificacao/", "/evento");
      if (request.method === "POST" && eventId) {
        const entry = await repository.findByPublicId(eventId);
        if (!entry) return problem(404, "not_found", "Documento não encontrado.");
        const raw = await readBody(request, 1024);
        const body = JSON.parse(raw.toString("utf8"));
        if (!["match", "mismatch"].includes(body?.result)) return problem(400, "invalid_result", "Resultado de comparação inválido.");
        await repository.appendObservation(entry, {
          eventType: body.result === "match" ? "hash_matched" : "hash_mismatched",
          outcome: body.result === "match" ? "success" : "failure",
          details: { channel: "browser-local-comparison" },
        });
        response.writeHead(204, headers());
        return response.end();
      }

      const sheetId = publicIdFromPath(url.pathname, "/folha/", ".pdf");
      if (request.method === "GET" && sheetId) {
        const entry = await repository.findByPublicId(sheetId);
        if (!entry) return problem(404, "not_found", "Documento não encontrado.");
        const bytes = await artifactStore.get(entry.representation_storage_key);
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
        const raw = await readBody(request, maxBodyBytes);
        if (!verifyWebhookSignature(request.headers["x-maiocchi-signature"], internalHmacKey, raw)) {
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
        return json(result.replayed ? 200 : 201, { publicId: result.publicId, envelope: result.envelope, replayed: Boolean(result.replayed) });
      }

      if (request.method === "POST" && url.pathname === "/internal/pades/tickets") {
        if (!privateSigningService) return problem(503, "provider_unavailable", "Provider PAdES privado indisponível.");
        const raw = await readBody(request, maxBodyBytes);
        if (!verifyWebhookSignature(request.headers["x-maiocchi-signature"], internalHmacKey, raw)) {
          return problem(401, "unauthorized", "Requisição interna não autorizada.");
        }
        const body = JSON.parse(raw.toString("utf8"));
        const result = await privateSigningService.createTicket({
          pdf: Buffer.from(body.pdfBase64 || "", "base64"),
          documentName: body.documentName,
          ttlSeconds: body.ttlSeconds,
        });
        return json(201, result);
      }

      return problem(404, "not_found", "Rota não encontrada.");
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : error instanceof SyntaxError || error instanceof TypeError ? 400 : 500;
      const message = status >= 500 ? "O serviço não conseguiu concluir a operação." : error.message;
      return problem(status, status >= 500 ? "internal_error" : "invalid_request", message);
    }
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const artifactRoot = process.env.ARTIFACT_ROOT || "/data/artifacts";
  const keyFile = process.env.AUTHENTICITY_PRIVATE_KEY_FILE;
  const internalHmacKey = process.env.AUTHENTICITY_INTERNAL_HMAC_KEY;
  if (!databaseUrl || !keyFile || !internalHmacKey || internalHmacKey.length < 32) throw new Error("pki-bridge configuration is incomplete");

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
  const artifactStore = new FileArtifactStore(artifactRoot);
  const providerEndpoint = process.env.PRIVATE_PADES_PROVIDER_URL;
  const providerApiKey = process.env.PRIVATE_PADES_PROVIDER_API_KEY;
  if (Boolean(providerEndpoint) !== Boolean(providerApiKey)) throw new Error("private PAdES provider configuration is incomplete");
  const privateSigningService = providerEndpoint ? new PrivateSigningService({
    repository: new PostgresPrivateSigningRepository(pool),
    artifactStore,
    provider: new PrivatePadesProviderClient({
      endpoint: providerEndpoint,
      apiKey: providerApiKey,
      allowInsecureInternal: process.env.PRIVATE_PADES_ALLOW_INTERNAL_HTTP === "true",
    }),
    baseUrl: process.env.PUBLIC_BASE_URL || "https://assinatura.maiocchi.adv.br",
  }) : null;
  const handler = createRequestHandler({
    repository,
    artifactStore,
    privateKey,
    publicKey,
    keyId,
    verificationKeys,
    validatorKeys,
    allowedPolicyOids: new Set((process.env.PADES_ALLOWED_POLICY_OIDS || "").split(",").map((value) => value.trim()).filter(Boolean)),
    allowPublicDisclosure: process.env.ALLOW_PUBLIC_ORIGINALS === "true",
    internalHmacKey,
    baseUrl: process.env.PUBLIC_BASE_URL || "https://assinatura.maiocchi.adv.br",
    allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
    healthCheck: () => pool.query("SELECT 1"),
    privateSigningService,
  });
  const port = Number(process.env.PORT || 3400);
  const server = http.createServer(handler);
  server.listen(port, "0.0.0.0");
  const shutdown = () => server.close(() => pool.end());
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
