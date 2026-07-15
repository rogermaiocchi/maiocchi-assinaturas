const stateNode = document.querySelector("#agent-state");
const versionNode = document.querySelector("#agent-version");
const profileNode = document.querySelector("#agent-profile");

function render(status) {
  if (!status) {
    stateNode.textContent = "Indisponível em 127.0.0.1:35100";
    stateNode.className = "warn";
    versionNode.textContent = "-";
    profileNode.textContent = "-";
    return;
  }

  stateNode.textContent = status.status === "ok" ? "Disponível" : "Resposta inesperada";
  stateNode.className = status.status === "ok" ? "ok" : "warn";
  versionNode.textContent = status.version || "-";
  profileNode.textContent = [status.provider, status.profile, status.architecture].filter(Boolean).join(" · ") || "-";
}

chrome.runtime.sendMessage({ type: "probe-agent" }, (response) => {
  void chrome.runtime.lastError;
  render(response?.status ?? null);
});
