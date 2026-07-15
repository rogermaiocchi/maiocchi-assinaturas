import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_BASE,
  EXTENSION_ID,
  PAGE_SOURCE,
  PORTAL_ORIGIN,
  agentStatusMessage,
  buildAuthorizeUrl,
  isAgentStatusUrl,
  isAllowedPortalOrigin,
  isAllowedPortalUrl,
  isTrustedExtensionPageSender,
  isTrustedPortalSender,
  isValidTicket,
  presenceMessage,
  sanitizeAgentStatus,
  validatePageMessage,
} from "../lib/protocol.mjs";

const SAMPLE_TICKET = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

test("isValidTicket aceita somente tokens base64url de 43 caracteres", () => {
  assert.equal(isValidTicket(SAMPLE_TICKET), true);
  assert.equal(isValidTicket("curto"), false);
  assert.equal(isValidTicket(`${SAMPLE_TICKET}!`), false);
});

test("isAllowedPortalUrl restringe ao prefixo /assinar-icp", () => {
  assert.equal(isAllowedPortalUrl("https://assinatura.maiocchi.adv.br/assinar-icp/private"), true);
  assert.equal(isAllowedPortalUrl("https://assinatura.maiocchi.adv.br/assinar-icp"), true);
  assert.equal(isAllowedPortalUrl("https://assinatura.maiocchi.adv.br/assinar-icp-evil"), false);
  assert.equal(isAllowedPortalUrl("https://assinatura.maiocchi.adv.br/"), false);
  assert.equal(isAllowedPortalUrl("https://evil.example/assinar-icp"), false);
});

test("valida a proveniência da aba e da página interna da extensão", () => {
  assert.equal(isTrustedPortalSender({ tab: { id: 9 }, url: "https://assinatura.maiocchi.adv.br/assinar-icp/private" }), true);
  assert.equal(isTrustedPortalSender({ tab: { id: 9 }, url: "https://evil.example/assinar-icp" }), false);
  assert.equal(isTrustedPortalSender({ url: "https://assinatura.maiocchi.adv.br/assinar-icp" }), false);
  assert.equal(isTrustedExtensionPageSender({ id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup.html` }), true);
  assert.equal(isTrustedExtensionPageSender({ id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/options.html` }), false);
});

test("buildAuthorizeUrl preserva ticket apenas no fragmento", () => {
  const url = new URL(buildAuthorizeUrl(SAMPLE_TICKET));
  assert.equal(url.origin + url.pathname, `${AGENT_BASE}/v1/authorize`);
  assert.equal(url.hash, `#ticket=${SAMPLE_TICKET}`);
  assert.equal(url.search, "");
});

test("validatePageMessage rejeita origem, fonte e ticket inválidos", () => {
  assert.deepEqual(validatePageMessage({ source: PAGE_SOURCE, type: "open-authorize", ticket: SAMPLE_TICKET }, "https://evil.example"), { ok: false, reason: "origin" });
  assert.deepEqual(validatePageMessage({ source: "outro", type: "open-authorize", ticket: SAMPLE_TICKET }, PORTAL_ORIGIN), { ok: false, reason: "source" });
  assert.deepEqual(validatePageMessage({ source: PAGE_SOURCE, type: "open-authorize", ticket: "x" }, PORTAL_ORIGIN), { ok: false, reason: "ticket" });
});

test("validatePageMessage aceita open-authorize e agent-status-request", () => {
  assert.deepEqual(validatePageMessage({ source: PAGE_SOURCE, type: "open-authorize", ticket: SAMPLE_TICKET }, PORTAL_ORIGIN), {
    ok: true,
    type: "open-authorize",
    ticket: SAMPLE_TICKET,
  });
  assert.deepEqual(validatePageMessage({ source: PAGE_SOURCE, type: "agent-status-request" }, PORTAL_ORIGIN), {
    ok: true,
    type: "agent-status-request",
  });
});

test("presenceMessage não expõe ticket", () => {
  const message = presenceMessage();
  assert.equal(message.type, "presence");
  assert.equal("ticket" in message, false);
  assert.equal(isAllowedPortalOrigin(PORTAL_ORIGIN), true);
});

test("sanitizeAgentStatus remove campos sensíveis ou desconhecidos", () => {
  assert.deepEqual(
    sanitizeAgentStatus({ status: "ok", version: "1.2.1", profile: "apple-silicon-native", ticket: "nao-deve-vazar" }),
    { status: "ok", version: "1.2.1", profile: "apple-silicon-native", provider: null, architecture: null, tokenPolicy: null },
  );
  assert.equal(sanitizeAgentStatus(null), null);
});

test("agentStatusMessage não replica ticket", () => {
  const message = agentStatusMessage({ status: "ok", version: "1.2.1", profile: "apple-silicon-native" });
  assert.equal(message.reachable, true);
  assert.equal("ticket" in message, false);
});

test("isAgentStatusUrl limita consulta ao endpoint de status", () => {
  assert.equal(isAgentStatusUrl(`${AGENT_BASE}/v1/status`), true);
  assert.equal(isAgentStatusUrl(`${AGENT_BASE}/v1/authorize`), false);
});
