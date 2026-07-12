"use client";

import { useState } from "react";
import { BadgeCheck, FileKey, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";

type Certificate = { fingerprintSha256: string; subject: string; keyAlgorithm: string };

export function PrivateAgentPanel() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [status, setStatus] = useState("Agente local ainda não verificado.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function verifyAgent() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://127.0.0.1:35100/v1/certificates", { headers: { accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.certificates)) throw new Error("Agente privado não respondeu corretamente.");
      setCertificates(data.certificates);
      setStatus(data.certificates.length ? `${data.certificates.length} certificado(s) RSA disponível(is).` : "Agente conectado, sem certificado RSA disponível.");
    } catch (caught) {
      setCertificates([]);
      setStatus("Agente privado indisponível.");
      setError(caught instanceof Error ? caught.message : "Não foi possível acessar o agente local.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="icp-console" aria-labelledby="private-agent-title">
      <div className="icp-console__header">
        <p className="eyebrow"><span className="status-dot" /> Agente local</p>
        <h2 id="private-agent-title">CryptoTokenKit no MacBook.</h2>
        <p>{status}</p>
      </div>
      <div className="icp-status-grid">
        <div><span className="mode-tag"><KeyRound aria-hidden="true" size={13} /> CHAVE</span><strong>Não exportável</strong><p>A operação ocorre no token.</p></div>
        <div><span className="mode-tag"><FileKey aria-hidden="true" size={13} /> CONEXÃO</span><strong>Loopback</strong><p>127.0.0.1:35100</p></div>
        <div><span className="mode-tag mode-tag--yellow"><BadgeCheck aria-hidden="true" size={13} /> PROVIDER</span><strong>Maiocchi PAdES</strong><p>DSS + CryptoTokenKit</p></div>
      </div>
      {error && <p className="icp-message icp-message--error" role="alert"><ShieldAlert aria-hidden="true" size={17} /><span>{error}</span></p>}
      {certificates.length > 0 && <div className="certificate-list" aria-label="Certificados detectados">{certificates.map((certificate) => <div className="certificate-option" key={certificate.fingerprintSha256}><FileKey aria-hidden="true" size={17} /><span><strong>{certificate.subject}</strong><small>{certificate.keyAlgorithm} · {certificate.fingerprintSha256.slice(0, 16)}…{certificate.fingerprintSha256.slice(-12)}</small></span></div>)}</div>}
      <button className="button button--yellow" type="button" onClick={() => void verifyAgent()} disabled={loading}>
        <RefreshCw className={loading ? "spin" : ""} aria-hidden="true" size={17} /><span>Verificar agente e token</span>
      </button>
    </section>
  );
}
