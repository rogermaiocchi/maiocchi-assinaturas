import { generateKeyPairSync } from "node:crypto";
import http from "node:http";
import { createPostQuantumKeyring, createPostQuantumSigner } from "../src/post-quantum-evidence.mjs";
import { PrivateSigningService } from "../src/private-signing-service.mjs";
import { createRequestHandler } from "../src/server.mjs";

const internalHmacKey = process.env.INTEGRATION_HMAC_KEY;
if (!internalHmacKey || internalHmacKey.length < 32) throw new Error("integration HMAC key is required");

const authenticityKeys = generateKeyPairSync("ed25519");
const postQuantumKeys = generateKeyPairSync("ml-dsa-65");
const postQuantumSigner = createPostQuantumKeyring(createPostQuantumSigner(postQuantumKeys.privateKey));
const repository = { async findByPublicId() { return null; } };
const artifactStore = { encryptedAtRest: true };
const privateSigningService = new PrivateSigningService({
  repository,
  artifactStore,
  postQuantumSigner,
  baseUrl: "https://assinatura.maiocchi.adv.br",
});
const handler = createRequestHandler({
  repository,
  artifactStore,
  privateKey: authenticityKeys.privateKey,
  publicKey: authenticityKeys.publicKey,
  keyId: "integration-ed25519",
  internalHmacKey,
  privateSigningService,
  surface: "internal",
});
const server = http.createServer(handler);

server.listen(3401, "0.0.0.0");
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
