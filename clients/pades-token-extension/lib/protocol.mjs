export const AGENT_BASE = "http://127.0.0.1:35100";
export const PORTAL_ORIGIN = "https://assinatura.maiocchi.adv.br";
export const EXTENSION_SOURCE = "maiocchi-pades-extension";
export const PAGE_SOURCE = "maiocchi-pades-page";
export const EXTENSION_VERSION = "1.0.1";
export const EXTENSION_ID = "cbikodnffamnfjoaobfpacilcfilmjlh";
export const AGENT_PROBE_TIMEOUT_MS = 1500;

const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PORTAL_PATH = "/assinar-icp";
const ALLOWED_MESSAGE_TYPES = new Set(["open-authorize", "agent-status-request"]);

export function isValidTicket(ticket) {
  return typeof ticket === "string" && TICKET_PATTERN.test(ticket);
}

export function isAllowedPortalUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.origin === PORTAL_ORIGIN
      && (url.pathname === PORTAL_PATH || url.pathname.startsWith(`${PORTAL_PATH}/`));
  } catch {
    return false;
  }
}

export function isAllowedPortalOrigin(origin) {
  return origin === PORTAL_ORIGIN;
}

export function isTrustedPortalSender(sender) {
  return Number.isInteger(sender?.tab?.id) && isAllowedPortalUrl(sender?.url);
}

export function isTrustedExtensionPageSender(sender, extensionId = EXTENSION_ID) {
  if (sender?.id !== extensionId || typeof sender?.url !== "string") return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === "chrome-extension:"
      && url.hostname === extensionId
      && url.pathname === "/popup.html";
  } catch {
    return false;
  }
}

export function buildAuthorizeUrl(ticket) {
  if (!isValidTicket(ticket)) throw new TypeError("ticket is invalid");
  return `${AGENT_BASE}/v1/authorize#ticket=${ticket}`;
}

export function isAgentStatusUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.origin === "http://127.0.0.1:35100" && url.pathname === "/v1/status";
  } catch {
    return false;
  }
}

export function sanitizeAgentStatus(payload) {
  if (!payload || typeof payload !== "object") return null;
  const version = typeof payload.version === "string" ? payload.version : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  const profile = typeof payload.profile === "string" ? payload.profile : null;
  const provider = typeof payload.provider === "string" ? payload.provider : null;
  const architecture = typeof payload.architecture === "string" ? payload.architecture : null;
  const tokenPolicy = typeof payload.tokenPolicy === "string"
    ? payload.tokenPolicy
    : typeof payload.token_policy === "string" ? payload.token_policy : null;
  if (!version && !status && !profile && !provider && !architecture && !tokenPolicy) return null;
  return { version, status, profile, provider, architecture, tokenPolicy };
}

export function validatePageMessage(data, origin) {
  if (!isAllowedPortalOrigin(origin)) return { ok: false, reason: "origin" };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "shape" };
  if (data.source !== PAGE_SOURCE) return { ok: false, reason: "source" };
  if (!ALLOWED_MESSAGE_TYPES.has(data.type)) return { ok: false, reason: "type" };

  if (data.type === "open-authorize") {
    if (!isValidTicket(data.ticket)) return { ok: false, reason: "ticket" };
    return { ok: true, type: data.type, ticket: data.ticket };
  }

  if (data.type === "agent-status-request") {
    return { ok: true, type: data.type };
  }

  return { ok: false, reason: "type" };
}

export function presenceMessage() {
  return {
    source: EXTENSION_SOURCE,
    type: "presence",
    version: EXTENSION_VERSION,
    agentBase: AGENT_BASE,
  };
}

export function agentStatusMessage(status) {
  return {
    source: EXTENSION_SOURCE,
    type: "agent-status",
    reachable: Boolean(status),
    status: status ? sanitizeAgentStatus(status) : null,
  };
}
