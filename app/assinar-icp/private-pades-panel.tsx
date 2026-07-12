"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Download, FileKey, KeyRound, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";

const bridgeBase = process.env.NEXT_PUBLIC_PKI_BRIDGE_URL || "";
const agentBase = "http://127.0.0.1:35100";

type Certificate = {
  fingerprintSha256: string;
  subject: string;
  certificateBase64: string;
  chainBase64: string[];
  keyAlgorithm: string;
};

type Ticket = {
  status: "pending" | "prepared" | "completed" | "failed" | "cancelled";
  documentName: string;
  documentSha256: string;
  expiresAt: string;
  signedPdfSha256: string | null;
};

type SigningTask = {
  sessionId: string;
  dataToSignBase64: string;
  digestAlgorithm: "SHA-256";
  signatureAlgorithm: "RSA-SHA256";
  documentSha256: string;
  certificateFingerprintSha256: string;
  documentName: string;
  expiresAt: string;
};

function ticketFromFragment() {
  const storageKey = "maiocchi-pades-ticket";
  const value = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("ticket") || "";
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) {
    window.sessionStorage.setItem(storageKey, value);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return value;
  }
  const stored = window.sessionStorage.getItem(storageKey) || "";
  return /^[A-Za-z0-9_-]{43}$/.test(stored) ? stored : "";
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "A operação não pôde ser concluída.");
  return data as T;
}

export function PrivatePadesPanel() {
  const [token, setToken] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selected, setSelected] = useState("");
  const [agentReady, setAgentReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Verificando ticket e agente local.");

  const authorization = useMemo(() => ({ authorization: `Bearer ${token}` }), [token]);
  const chosen = certificates.find((certificate) => certificate.fingerprintSha256 === selected);

  const refresh = useCallback(async (currentToken: string) => {
    setError("");
    const [ticketResponse, agentResponse] = await Promise.all([
      fetch(`${bridgeBase}/api/pades/ticket`, { headers: { authorization: `Bearer ${currentToken}` }, cache: "no-store" }),
      fetch(`${agentBase}/v1/status`, { headers: { accept: "application/json" }, cache: "no-store" }),
    ]);
    const currentTicket = await responseJson<Ticket>(ticketResponse);
    await responseJson(agentResponse);
    const certificateResponse = await fetch(`${agentBase}/v1/certificates`, { headers: { accept: "application/json" }, cache: "no-store" });
    const listed = await responseJson<{ certificates: Certificate[] }>(certificateResponse);
    setTicket(currentTicket);
    setAgentReady(true);
    setCertificates(listed.certificates);
    setSelected((value) => value || listed.certificates[0]?.fingerprintSha256 || "");
    setMessage(listed.certificates.length ? "Documento e agente confirmados." : "Nenhum certificado RSA disponível no token.");
  }, []);

  useEffect(() => {
    const current = ticketFromFragment();
    setToken(current);
    if (!current) {
      setError("O link de assinatura é inválido ou já perdeu o ticket de autorização.");
      return;
    }
    void refresh(current).catch((caught) => {
      setAgentReady(false);
      setError(caught instanceof Error ? caught.message : "Não foi possível conectar ao agente local.");
    });
  }, [refresh]);

  async function signDocument() {
    if (!chosen || !ticket || ticket.status !== "pending") return;
    setBusy(true);
    setError("");
    try {
      setMessage("Preparando o PAdES no serviço privado.");
      const prepared = await responseJson<SigningTask>(await fetch(`${bridgeBase}/api/pades/prepare`, {
        method: "POST",
        headers: { ...authorization, "content-type": "application/json" },
        body: JSON.stringify({ certificateBase64: chosen.certificateBase64, chainBase64: chosen.chainBase64 }),
      }));
      if (prepared.documentSha256 !== ticket.documentSha256 || prepared.certificateFingerprintSha256 !== chosen.fingerprintSha256) {
        throw new Error("A tarefa criptográfica não corresponde ao documento ou certificado selecionado.");
      }
      setMessage("Aguardando confirmação local e autorização do token.");
      const localSignature = await responseJson<{ signatureBase64: string; certificateFingerprintSha256: string }>(
        await fetch(`${agentBase}/v1/sign`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(prepared),
        }),
      );
      setMessage("Concluindo e validando o PDF assinado.");
      const completed = await responseJson<{ status: string; signedPdfSha256: string }>(await fetch(`${bridgeBase}/api/pades/complete`, {
        method: "POST",
        headers: { ...authorization, "content-type": "application/json" },
        body: JSON.stringify(localSignature),
      }));
      setTicket({ ...ticket, status: "completed", signedPdfSha256: completed.signedPdfSha256 });
      setMessage("PAdES concluído e validado.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A assinatura falhou.");
      setMessage("Assinatura não concluída.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadResult() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${bridgeBase}/api/pades/result`, { headers: authorization, cache: "no-store" });
      if (!response.ok) throw new Error("O PDF assinado não está disponível.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = ticket?.documentName.replace(/\.pdf$/i, "-assinado.pdf") || "documento-assinado.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="icp-console" aria-labelledby="private-pades-title">
      <div className="icp-console__header">
        <p className="eyebrow"><span className="status-dot" /> Provider privado</p>
        <h2 id="private-pades-title">Documento vinculado ao token.</h2>
        <p>{message}</p>
      </div>

      <div className="icp-status-grid">
        <div><span className="mode-tag"><FileKey aria-hidden="true" size={13} /> DOCUMENTO</span><strong>{ticket?.documentName || "Não identificado"}</strong><p className="hash-value">{ticket?.documentSha256 || "-"}</p></div>
        <div><span className="mode-tag"><KeyRound aria-hidden="true" size={13} /> AGENTE</span><strong>{agentReady ? "CryptoTokenKit conectado" : "Indisponível"}</strong><p>Porta local 35100</p></div>
        <div><span className="mode-tag mode-tag--yellow"><BadgeCheck aria-hidden="true" size={13} /> PADES</span><strong>{ticket?.status === "completed" ? "Validado" : "Aguardando assinatura"}</strong><p className="hash-value">{ticket?.signedPdfSha256 || "-"}</p></div>
      </div>

      {error && <p className="icp-message icp-message--error" role="alert"><ShieldAlert aria-hidden="true" size={17} /><span>{error}</span></p>}

      {certificates.length > 0 && ticket?.status !== "completed" && (
        <div className="certificate-list" aria-label="Certificados disponíveis">
          {certificates.map((certificate) => (
            <label className="certificate-option" key={certificate.fingerprintSha256}>
              <input type="radio" name="private-pades-certificate" value={certificate.fingerprintSha256} checked={selected === certificate.fingerprintSha256} onChange={() => setSelected(certificate.fingerprintSha256)} />
              <span><strong>{certificate.subject}</strong><small>{certificate.keyAlgorithm} · {certificate.fingerprintSha256.slice(0, 16)}…{certificate.fingerprintSha256.slice(-12)}</small></span>
            </label>
          ))}
        </div>
      )}

      <div className="icp-console__actions">
        {ticket?.status === "completed" ? (
          <button className="button button--yellow" type="button" onClick={() => void downloadResult()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <Download aria-hidden="true" size={17} />}<span>Baixar PDF assinado</span>
          </button>
        ) : (
          <button className="button button--yellow" type="button" onClick={() => void signDocument()} disabled={busy || !agentReady || !chosen || ticket?.status !== "pending"}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <KeyRound aria-hidden="true" size={17} />}<span>Assinar com o token</span>
          </button>
        )}
        <button className="button button--dark" type="button" onClick={() => token && void refresh(token)} disabled={busy || !token}>
          <RefreshCw aria-hidden="true" size={17} /><span>Verificar novamente</span>
        </button>
      </div>
    </section>
  );
}
