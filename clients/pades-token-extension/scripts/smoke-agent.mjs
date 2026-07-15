const agentBaseUrl = "http://127.0.0.1:35100";
const extensionOrigin = "chrome-extension://cbikodnffamnfjoaobfpacilcfilmjlh";

async function fetchJson(path, headers = {}) {
  const response = await fetch(`${agentBaseUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`${path} respondeu HTTP ${response.status}.`);
  }

  return response.json();
}

const status = await fetchJson("/v1/status");
if (
  status.status !== "ok" ||
  status.provider !== "CryptoTokenKit" ||
  status.architecture !== "arm64" ||
  status.tokenPolicy !== "external-store-rsa-2048-fail-closed"
) {
  throw new Error("O agente local não atende ao perfil macOS fail-closed esperado.");
}

const certificateList = await fetchJson("/v1/certificates", {
  Origin: extensionOrigin,
});
const certificates = certificateList.certificates ?? [];
const eligible = certificates.filter(
  (certificate) =>
    certificate.tokenBacked === true &&
    certificate.keyAlgorithm === "RSA" &&
    certificate.keySizeInBits >= 2_048,
);

if (eligible.length === 0) {
  throw new Error("Nenhum certificado RSA externo elegível foi detectado.");
}

console.log(
  JSON.stringify({
    status: "ok",
    agentVersion: status.version,
    provider: status.provider,
    architecture: status.architecture,
    eligibleCertificates: eligible.length,
  }),
);
