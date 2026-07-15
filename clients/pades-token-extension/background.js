import {
  AGENT_BASE,
  AGENT_PROBE_TIMEOUT_MS,
  buildAuthorizeUrl,
  isTrustedExtensionPageSender,
  isTrustedPortalSender,
  sanitizeAgentStatus,
} from "./lib/protocol.mjs";

async function probeAgent() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${AGENT_BASE}/v1/status`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return sanitizeAgentStatus(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "probe-agent") {
    if (!isTrustedPortalSender(sender) && !isTrustedExtensionPageSender(sender, chrome.runtime.id)) {
      sendResponse({ status: null, error: "sender_not_allowed" });
      return;
    }
    void probeAgent().then((status) => sendResponse({ status }));
    return true;
  }

  if (message.type === "open-authorize" && typeof message.ticket === "string") {
    if (!isTrustedPortalSender(sender)) {
      sendResponse({ ok: false, error: "sender_not_allowed" });
      return;
    }
    try {
      const target = buildAuthorizeUrl(message.ticket);
      void chrome.tabs.create({ url: target, active: true })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false, error: "tab_open_failed" }));
    } catch {
      sendResponse({ ok: false, error: "invalid_ticket" });
    }
    return true;
  }
});
