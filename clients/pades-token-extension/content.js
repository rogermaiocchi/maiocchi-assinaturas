"use strict";
(() => {
  // lib/protocol.mjs
  var AGENT_BASE = "http://127.0.0.1:35100";
  var PORTAL_ORIGIN = "https://assinatura.maiocchi.adv.br";
  var EXTENSION_SOURCE = "maiocchi-pades-extension";
  var PAGE_SOURCE = "maiocchi-pades-page";
  var EXTENSION_VERSION = "1.0.1";
  var TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  var PORTAL_PATH = "/assinar-icp";
  var ALLOWED_MESSAGE_TYPES = /* @__PURE__ */ new Set(["open-authorize", "agent-status-request"]);
  function isValidTicket(ticket) {
    return typeof ticket === "string" && TICKET_PATTERN.test(ticket);
  }
  function isAllowedPortalUrl(urlString) {
    try {
      const url = new URL(urlString);
      return url.origin === PORTAL_ORIGIN && (url.pathname === PORTAL_PATH || url.pathname.startsWith(`${PORTAL_PATH}/`));
    } catch {
      return false;
    }
  }
  function isAllowedPortalOrigin(origin) {
    return origin === PORTAL_ORIGIN;
  }
  function sanitizeAgentStatus(payload) {
    if (!payload || typeof payload !== "object") return null;
    const version = typeof payload.version === "string" ? payload.version : null;
    const status = typeof payload.status === "string" ? payload.status : null;
    const profile = typeof payload.profile === "string" ? payload.profile : null;
    const provider = typeof payload.provider === "string" ? payload.provider : null;
    const architecture = typeof payload.architecture === "string" ? payload.architecture : null;
    const tokenPolicy = typeof payload.tokenPolicy === "string" ? payload.tokenPolicy : typeof payload.token_policy === "string" ? payload.token_policy : null;
    if (!version && !status && !profile && !provider && !architecture && !tokenPolicy) return null;
    return { version, status, profile, provider, architecture, tokenPolicy };
  }
  function validatePageMessage(data, origin) {
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
  function presenceMessage() {
    return {
      source: EXTENSION_SOURCE,
      type: "presence",
      version: EXTENSION_VERSION,
      agentBase: AGENT_BASE
    };
  }
  function agentStatusMessage(status) {
    return {
      source: EXTENSION_SOURCE,
      type: "agent-status",
      reachable: Boolean(status),
      status: status ? sanitizeAgentStatus(status) : null
    };
  }

  // src/content.mjs
  function postToPage(payload) {
    window.postMessage(payload, PORTAL_ORIGIN);
  }
  function announcePresence() {
    postToPage(presenceMessage());
  }
  if (!window.isSecureContext || !isAllowedPortalUrl(window.location.href)) {
    throw new Error("Maiocchi PAdES extension blocked outside the authorized secure portal path.");
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== PORTAL_ORIGIN) return;
    const validated = validatePageMessage(event.data, event.origin);
    if (!validated.ok) return;
    if (validated.type === "open-authorize") {
      void chrome.runtime.sendMessage(
        { type: "open-authorize", ticket: validated.ticket },
        () => {
          void chrome.runtime.lastError;
        }
      );
      return;
    }
    if (validated.type === "agent-status-request") {
      void chrome.runtime.sendMessage({ type: "probe-agent" }, (response) => {
        void chrome.runtime.lastError;
        postToPage(agentStatusMessage(response?.status ?? null));
      });
    }
  });
  announcePresence();
})();
