import {
  PORTAL_ORIGIN,
  agentStatusMessage,
  isAllowedPortalUrl,
  presenceMessage,
  validatePageMessage,
} from "../lib/protocol.mjs";

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
      },
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
