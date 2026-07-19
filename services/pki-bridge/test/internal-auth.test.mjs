import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import {
  bodySha256,
  internalRequestMessage,
  signInternalResponse,
  verifyInternalRequest,
  verifyInternalResponse,
} from "../src/internal-auth.mjs";
import { MemoryInternalReplayGuard } from "../src/internal-replay-guard.mjs";

const secret = ["internal", "test", "key", "with", "32", "characters"].join("-");
const rawBody = Buffer.from('{"value":1}');
const timestamp = 1_789_000_000;
const nonce = "0123456789abcdef0123456789abcdef";

function requestHeader(method = "POST", target = "/internal/evidence/verify") {
  const requestDigest = bodySha256(rawBody);
  const digest = createHmac("sha256", secret).update(internalRequestMessage({
    timestamp: String(timestamp), nonce, method, target, requestDigest,
  })).digest("hex");
  return `${timestamp}.${nonce}.${digest}`;
}

test("vincula HMAC interno a nonce, método, caminho e corpo", () => {
  const auth = verifyInternalRequest({
    header: requestHeader(), secret, rawBody, method: "POST", target: "/internal/evidence/verify", now: timestamp,
  });
  assert.equal(auth.nonce, nonce);
  assert.equal(auth.requestDigest, createHash("sha256").update(rawBody).digest("hex"));
  assert.equal(verifyInternalRequest({
    header: requestHeader(), secret, rawBody, method: "POST", target: "/internal/evidence/compose", now: timestamp,
  }), null);
  assert.equal(verifyInternalRequest({
    header: requestHeader(), secret, rawBody: Buffer.from("{}"), method: "POST", target: "/internal/evidence/verify", now: timestamp,
  }), null);
  assert.equal(verifyInternalRequest({
    header: requestHeader(), secret, rawBody, method: "POST", target: "/internal/evidence/verify", now: timestamp + 300,
  }), null);
});

test("vincula a resposta à requisição e ao status HTTP", () => {
  const requestAuth = verifyInternalRequest({
    header: requestHeader(), secret, rawBody, method: "POST", target: "/internal/evidence/verify", now: timestamp,
  });
  const responseBody = Buffer.from('{"verified":true}');
  const header = signInternalResponse({ secret, requestAuth, status: 200, rawBody: responseBody, now: timestamp });
  assert.equal(verifyInternalResponse({ header, secret, requestAuth, status: 200, rawBody: responseBody, now: timestamp }), true);
  assert.equal(verifyInternalResponse({ header, secret, requestAuth, status: 201, rawBody: responseBody, now: timestamp }), false);
  assert.equal(verifyInternalResponse({ header, secret, requestAuth, status: 200, rawBody: Buffer.from("{}"), now: timestamp }), false);
  assert.equal(verifyInternalResponse({ header, secret, requestAuth, status: 200, rawBody: responseBody, now: timestamp + 300 }), false);
});

test("consome cada nonce uma única vez", async () => {
  const guard = new MemoryInternalReplayGuard();
  const auth = { nonce, expiresAt: new Date((timestamp + 300) * 1000) };
  assert.equal(await guard.consume(auth), true);
  assert.equal(await guard.consume(auth), false);
  assert.equal(await guard.consume({
    nonce: "fedcba9876543210fedcba9876543210",
    expiresAt: new Date(Date.now() - 1),
  }), false);
});
