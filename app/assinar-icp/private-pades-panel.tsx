"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Download, FileKey, KeyRound, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";

const bridgeBase = process.env.NEXT_PUBLIC_PKI_BRIDGE_URL || "";
const agentBase = "http://127.0.0.1:35100";

type Ticket = {
  status: "pending" | "prepared" | "completed" | "failed" | "cancelled";
  documentName: string;
  documentSha256: string;
  expiresAt: string;
  signedPdfSha256: string | null;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Verificando ticket e agente local.");

  const refresh = useCallback(async (currentToken: string) => {
    setError("");
    const ticketResponse = await fetch(`${bridgeBase}/api/pades/ticket`, { headers: { authorization: `Bearer ${currentToken}` }, cache: "no-store" });
    const currentTicket = await responseJson<Ticket>(ticketResponse);
    setTicket(currentTicket);
    setMessage(currentTicket.status === "completed" ? "PAdES concluído e validado." : "Documento confirmado. Continue no agente local protegido.");
  }, []);

  useEffect(() => {
    async function initialize() {
      const current = ticketFromFragment();
      setToken(current);
      if (!current) {
        setError("O link de assinatura é inválido ou já perdeu o ticket de autorização.");
        return;
      }
      try {
        await refresh(current);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Não foi possível validar o ticket de assinatura.");
      }
    }
    void initialize();
  }, [refresh]);

  function signDocument() {
    if (!token || !ticket || ticket.status !== "pending") return;
    window.location.assign(`${agentBase}/v1/authorize#ticket=${token}`);
  }

  async function downloadResult() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${bridgeBase}/api/pades/result`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
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
        <div><span className="mode-tag"><KeyRound aria-hidden="true" size={13} /> AGENTE</span><strong>CryptoTokenKit local</strong><p>Abertura protegida · porta 35100</p></div>
        <div><span className="mode-tag mode-tag--yellow"><BadgeCheck aria-hidden="true" size={13} /> PADES</span><strong>{ticket?.status === "completed" ? "Validado" : "Aguardando assinatura"}</strong><p className="hash-value">{ticket?.signedPdfSha256 || "-"}</p></div>
      </div>

      {error && <p className="icp-message icp-message--error" role="alert"><ShieldAlert aria-hidden="true" size={17} /><span>{error}</span></p>}

      <div className="icp-console__actions">
        {ticket?.status === "completed" ? (
          <button className="button button--yellow" type="button" onClick={() => void downloadResult()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <Download aria-hidden="true" size={17} />}<span>Baixar PDF assinado</span>
          </button>
        ) : (
          <button className="button button--yellow" type="button" onClick={signDocument} disabled={busy || ticket?.status !== "pending"}>
            <KeyRound aria-hidden="true" size={17} /><span>Abrir agente e assinar</span>
          </button>
        )}
        <button className="button button--dark" type="button" onClick={() => token && void refresh(token)} disabled={busy || !token}>
          <RefreshCw aria-hidden="true" size={17} /><span>Verificar novamente</span>
        </button>
      </div>
    </section>
  );
}
