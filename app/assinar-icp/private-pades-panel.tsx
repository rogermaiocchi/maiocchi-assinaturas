"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Cloud, Download, FileKey, KeyRound, LoaderCircle, MapPin, RefreshCw, ShieldAlert, Usb } from "lucide-react";

const bridgeBase = process.env.NEXT_PUBLIC_PKI_BRIDGE_URL || "";
const agentBase = "http://127.0.0.1:35100";

type Ticket = {
  status: "pending" | "prepared" | "completed" | "failed" | "cancelled";
  documentName: string;
  documentSha256: string;
  expiresAt: string;
  signedPdfSha256: string | null;
  publicId: string;
  documentNumber: string;
  postQuantumCode: string | null;
  finalPostQuantumCode: string | null;
  localSigningAvailable: boolean;
  remoteSigningAvailable: boolean;
};

type GeolocationMetadata = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type ClientMetadata = {
  userAgent: string;
  platform: string;
  timezone: string;
  locale: string;
  screen: {
    width: number;
    height: number;
  };
  geolocation?: GeolocationMetadata;
};

const geolocationTimeoutMs = 3000;

function collectBrowserMetadata(): Omit<ClientMetadata, "geolocation"> {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
    },
  };
}

function requestOptionalGeolocation(): Promise<GeolocationMetadata | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = (geolocation?: GeolocationMetadata) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(geolocation);
    };

    timeoutId = window.setTimeout(() => finish(), geolocationTimeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => finish({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
        () => finish(),
        { enableHighAccuracy: false, maximumAge: 0, timeout: geolocationTimeoutMs },
      );
    } catch {
      finish();
    }
  });
}

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
  const [message, setMessage] = useState("Verificando documento e modalidades disponíveis.");

  const refresh = useCallback(async (currentToken: string) => {
    setError("");
    const ticketResponse = await fetch(`${bridgeBase}/api/pades/ticket`, { headers: { authorization: `Bearer ${currentToken}` }, cache: "no-store" });
    const currentTicket = await responseJson<Ticket>(ticketResponse);
    setTicket(currentTicket);
    setMessage(currentTicket.status === "completed"
      ? "PAdES concluído e validado."
      : currentTicket.remoteSigningAvailable
        ? "Documento confirmado. A assinatura em nuvem dispensa instalação."
        : currentTicket.localSigningAvailable
          ? "Documento confirmado. A assinatura com token local permanece disponível."
          : "Nenhuma modalidade de assinatura está disponível para este documento.");
    return currentTicket;
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
        const currentTicket = await refresh(current);
        const signatureSessionId = new URLSearchParams(window.location.search).get("signatureSessionId") || "";
        if (signatureSessionId && currentTicket.remoteSigningAvailable && currentTicket.status === "pending") {
          setBusy(true);
          setMessage("Conferindo o resultado devolvido pelo prestador de confiança.");
          const completion = await responseJson<{ status: "completed" | "cancelled" | "expired" | "failed" }>(await fetch(`${bridgeBase}/api/pades/remote/complete`, {
            method: "POST",
            headers: { authorization: `Bearer ${current}`, "content-type": "application/json" },
            body: JSON.stringify({ signatureSessionId }),
          }));
          window.history.replaceState(null, "", window.location.pathname);
          await refresh(current);
          if (completion.status === "cancelled") setMessage("A assinatura foi cancelada. Você pode iniciar uma nova tentativa.");
          if (completion.status === "expired") setMessage("A sessão expirou. Inicie uma nova tentativa.");
          if (completion.status === "failed") setMessage("O prestador não concluiu a sessão. Inicie uma nova tentativa.");
          setBusy(false);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Não foi possível validar o ticket de assinatura.");
        setBusy(false);
      }
    }
    void initialize();
  }, [refresh]);

  function signDocument() {
    if (!token || !ticket?.localSigningAvailable || ticket.status !== "pending") return;
    window.location.assign(`${agentBase}/v1/authorize#ticket=${token}`);
  }

  async function signRemotely() {
    if (!token || !ticket?.remoteSigningAvailable || ticket.status !== "pending") return;
    setBusy(true);
    setError("");
    setMessage("Aguardando a localização opcional, caso você autorize no navegador.");
    try {
      const geolocation = await requestOptionalGeolocation();
      const clientMetadata: ClientMetadata = {
        ...collectBrowserMetadata(),
        ...(geolocation ? { geolocation } : {}),
      };
      setMessage("Criando sessão protegida no prestador de confiança.");
      const session = await responseJson<{ redirectUrl: string }>(await fetch(`${bridgeBase}/api/pades/remote/session`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ clientMetadata }),
      }));
      const destination = new URL(session.redirectUrl);
      if (destination.protocol !== "https:") throw new Error("O prestador retornou um endereço inseguro.");
      window.location.assign(destination.toString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível iniciar a assinatura em nuvem.");
      setMessage("A assinatura remota não foi iniciada.");
      setBusy(false);
    }
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
        <h2 id="private-pades-title">Documento pronto para assinatura.</h2>
        <p>{message}</p>
      </div>

      <div className="icp-status-grid">
        <div><span className="mode-tag"><FileKey aria-hidden="true" size={13} /> DOCUMENTO</span><strong>{ticket?.documentName || "Não identificado"}</strong><p>{ticket?.publicId || "-"}</p><p className="hash-value">{ticket?.documentSha256 || "-"}</p></div>
        <div><span className="mode-tag"><KeyRound aria-hidden="true" size={13} /> MODALIDADE</span><strong>{ticket?.remoteSigningAvailable ? (ticket.localSigningAvailable ? "Nuvem ou token" : "Certificado em nuvem") : "Token local"}</strong><p>{ticket?.remoteSigningAvailable ? "PSC ICP-Brasil · sem instalação" : "Agente protegido · porta 35100"}</p></div>
        <div><span className="mode-tag mode-tag--yellow"><BadgeCheck aria-hidden="true" size={13} /> PADES</span><strong>{ticket?.status === "completed" ? "Validado" : "Aguardando assinatura"}</strong><p className="hash-value">{ticket?.signedPdfSha256 || ticket?.postQuantumCode || "-"}</p>{ticket?.finalPostQuantumCode && <p className="hash-value">{ticket.finalPostQuantumCode}</p>}</div>
      </div>

      {error && <p className="icp-message icp-message--error" role="alert"><ShieldAlert aria-hidden="true" size={17} /><span>{error}</span></p>}
      {ticket?.remoteSigningAvailable && ticket.status !== "completed" && (
        <p className="icp-message"><MapPin aria-hidden="true" size={17} /><span>A localização é opcional. Se autorizada, será incorporada à página final e ficará visível a quem receber o PDF ou o código de verificação; a recusa não impede a assinatura.</span></p>
      )}

      <div className="icp-console__actions">
        {ticket?.status === "completed" ? (
          <button className="button button--yellow" type="button" onClick={() => void downloadResult()} disabled={busy}>
            {busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <Download aria-hidden="true" size={17} />}<span>Baixar PDF assinado</span>
          </button>
        ) : (
          <>
            {ticket?.remoteSigningAvailable && (
              <button className="button button--yellow" type="button" onClick={() => void signRemotely()} disabled={busy || ticket.status !== "pending"}>
                {busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <Cloud aria-hidden="true" size={17} />}<span>Assinar sem instalar</span>
              </button>
            )}
            {ticket?.localSigningAvailable && (
              <button className={ticket?.remoteSigningAvailable ? "button button--dark" : "button button--yellow"} type="button" onClick={signDocument} disabled={busy || ticket?.status !== "pending"}>
                {ticket?.remoteSigningAvailable ? <Usb aria-hidden="true" size={17} /> : <KeyRound aria-hidden="true" size={17} />}<span>Usar token local</span>
              </button>
            )}
          </>
        )}
        <button className="button button--dark" type="button" onClick={() => token && void refresh(token)} disabled={busy || !token}>
          <RefreshCw aria-hidden="true" size={17} /><span>Verificar novamente</span>
        </button>
      </div>
    </section>
  );
}
