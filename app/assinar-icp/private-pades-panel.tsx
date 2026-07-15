"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Clock3,
  Cloud,
  Download,
  FileKey,
  FileText,
  Hash,
  KeyRound,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Usb,
} from "lucide-react";

const bridgeBase = process.env.NEXT_PUBLIC_PKI_BRIDGE_URL || "";
const agentBase = "http://127.0.0.1:35100";
const extensionDownloadUrl = "https://github.com/rogermaiocchi/maiocchi-pades-token-extension/releases/download/v1.0.1/maiocchi-pades-token-extension-v1.0.1.zip";
const extensionSource = "maiocchi-pades-extension";
const pageSource = "maiocchi-pades-page";

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
  linkedToDocuseal: boolean;
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

async function commitLinkedResult(ticket: string) {
  return responseJson<{ status: "committed"; redirectUrl: string }>(await fetch("/assinaturas/qualificada/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket }),
  }));
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function PrivatePadesPanel() {
  const [token, setToken] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Verificando documento e modalidades disponíveis.");
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [localAgentDetected, setLocalAgentDetected] = useState(false);
  const linkedCommitRef = useRef<Promise<{ status: "committed"; redirectUrl: string }> | null>(null);

  const commitLinkedResultOnce = useCallback((currentToken: string) => {
    if (!linkedCommitRef.current) {
      linkedCommitRef.current = commitLinkedResult(currentToken).catch((caught) => {
        linkedCommitRef.current = null;
        throw caught;
      });
    }
    return linkedCommitRef.current;
  }, []);

  const refresh = useCallback(async (currentToken: string) => {
    setError("");
    const ticketResponse = await fetch(`${bridgeBase}/api/pades/ticket`, { headers: { authorization: `Bearer ${currentToken}` }, cache: "no-store" });
    const currentTicket = await responseJson<Ticket>(ticketResponse);
    setTicket(currentTicket);
    if (currentTicket.status === "completed" && currentTicket.linkedToDocuseal) {
      setBusy(true);
      setMessage("Incorporando o PAdES validado ao documento do signatário.");
      const committed = await commitLinkedResultOnce(currentToken);
      window.location.replace(committed.redirectUrl);
      return currentTicket;
    }
    setMessage(currentTicket.status === "completed"
      ? "PAdES concluído e validado."
      : currentTicket.remoteSigningAvailable
        ? "Documento confirmado. A autorização no PSC dispensa instalação."
        : currentTicket.localSigningAvailable
          ? "Documento confirmado. O token USB será operado pelo bridge local autorizado."
          : "A assinatura qualificada não está habilitada para este documento.");
    return currentTicket;
  }, [commitLinkedResultOnce]);

  useEffect(() => {
    async function initialize() {
      const current = ticketFromFragment();
      setToken(current);
      if (!current) {
        setError("O link de assinatura é inválido ou já perdeu o ticket de autorização.");
        setMessage("Não foi possível abrir este documento.");
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

  useEffect(() => {
    function requestAgentStatus() {
      window.postMessage({ source: pageSource, type: "agent-status-request" }, window.location.origin);
    }

    function handleExtensionMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object" || event.data.source !== extensionSource) return;
      if (event.data.type === "presence") {
        setExtensionDetected(true);
        requestAgentStatus();
      }
      if (event.data.type === "agent-status") {
        setExtensionDetected(true);
        setLocalAgentDetected(event.data.reachable === true && event.data.status?.status === "ok");
      }
    }

    window.addEventListener("message", handleExtensionMessage);
    const timers = [0, 250, 1000].map((delay) => window.setTimeout(requestAgentStatus, delay));
    return () => {
      window.removeEventListener("message", handleExtensionMessage);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function signWithLocalToken() {
    if (!token || !ticket?.localSigningAvailable || ticket.status !== "pending") return;
    if (extensionDetected) {
      setMessage(localAgentDetected ? "Abrindo a autorização no agente local." : "Acionando o bridge local para localizar o agente.");
      window.postMessage({ source: pageSource, type: "open-authorize", ticket: token }, window.location.origin);
      return;
    }
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

  const hasTicket = Boolean(ticket);
  const completed = ticket?.status === "completed";
  const invalid = !busy && !hasTicket && Boolean(error);
  const modality = ticket?.remoteSigningAvailable
    ? (ticket.localSigningAvailable ? "Nuvem ou token USB" : "Certificado em nuvem")
    : ticket?.localSigningAvailable ? "Token USB" : "Indisponível";

  return (
    <section className="pades-workspace" aria-labelledby="private-pades-title">
      <header className="pades-workspace__header">
        <div>
          <p className="eyebrow"><span className="status-dot" /> Ambiente protegido</p>
          <h2 id="private-pades-title">Documento pronto para assinatura.</h2>
          <p aria-live="polite">{message}</p>
        </div>
        <span className={`pades-state${completed ? " pades-state--complete" : invalid ? " pades-state--error" : ""}`}>
          {completed ? <BadgeCheck aria-hidden="true" size={18} /> : busy ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : invalid ? <ShieldAlert aria-hidden="true" size={18} /> : <ShieldCheck aria-hidden="true" size={18} />}
          {completed ? "Concluído" : busy ? "Processando" : invalid ? "Link inválido" : "Protegido"}
        </span>
      </header>

      <ol className="pades-progress" aria-label="Etapas da assinatura">
        <li className={hasTicket ? "is-complete" : ""}><span>{hasTicket ? <Check aria-hidden="true" size={15} /> : "1"}</span><strong>Documento</strong><small>{hasTicket ? "Conferido" : "Aguardando link"}</small></li>
        <li className={completed ? "is-complete" : hasTicket ? "is-current" : ""}><span>{completed ? <Check aria-hidden="true" size={15} /> : "2"}</span><strong>Certificado</strong><small>{completed ? "Aplicado" : hasTicket ? "Autorize no PSC" : "Aguardando"}</small></li>
        <li className={completed ? "is-complete" : ""}><span>{completed ? <Check aria-hidden="true" size={15} /> : "3"}</span><strong>Resultado</strong><small>{completed ? "Disponível" : "Aguardando"}</small></li>
      </ol>

      <div className="pades-workspace__grid">
        <section className="pades-document-pane" aria-labelledby="pades-document-title">
          <div className="pades-pane-heading"><FileText aria-hidden="true" size={24} /><div><p>Documento</p><h3 id="pades-document-title">{ticket?.documentName || (invalid ? "Documento não disponível" : "Carregando documento")}</h3></div></div>
          <dl className="pades-metadata">
            <div><dt><FileKey aria-hidden="true" size={15} /> Identificador</dt><dd>{ticket?.publicId || "-"}</dd></div>
            <div><dt><Hash aria-hidden="true" size={15} /> SHA-256 original</dt><dd className="hash-value">{ticket?.documentSha256 || "-"}</dd></div>
            <div><dt><Clock3 aria-hidden="true" size={15} /> Ticket válido até</dt><dd>{formatDate(ticket?.expiresAt)}</dd></div>
            {ticket?.documentNumber && <div><dt><FileText aria-hidden="true" size={15} /> Número</dt><dd>{ticket.documentNumber}</dd></div>}
            {(ticket?.signedPdfSha256 || ticket?.postQuantumCode || ticket?.finalPostQuantumCode) && (
              <div><dt><ShieldCheck aria-hidden="true" size={15} /> Evidência final</dt><dd className="hash-value">{ticket?.signedPdfSha256 || ticket?.finalPostQuantumCode || ticket?.postQuantumCode}</dd></div>
            )}
          </dl>
        </section>

        <aside className="pades-action-pane" aria-labelledby="pades-action-title">
          <div className="pades-pane-heading"><KeyRound aria-hidden="true" size={24} /><div><p>Modalidade disponível</p><h3 id="pades-action-title">{modality}</h3></div></div>
          <p className="pades-action-pane__description">{!ticket ? "O acesso depende de um link individual e válido." : ticket.remoteSigningAvailable ? "A chave em nuvem permanece no PSC e dispensa instalação. Quando habilitado, o token USB usa exclusivamente o bridge local autorizado." : ticket.localSigningAvailable ? "O token USB exige o bridge local instalado no computador que contém o dispositivo; o PIN nunca é enviado ao portal." : "A modalidade qualificada permanece bloqueada até que um PSC credenciado ou bridge local homologado esteja disponível."}</p>

          {error && <p className="icp-message icp-message--error" role="alert"><ShieldAlert aria-hidden="true" size={17} /><span>{error}</span></p>}
          {ticket?.remoteSigningAvailable && !completed && <p className="icp-message"><MapPin aria-hidden="true" size={17} /><span>A localização é opcional e a recusa não impede a assinatura.</span></p>}

          <div className="pades-actions">
            {completed ? (
              <button className="button button--yellow" type="button" onClick={() => void downloadResult()} disabled={busy}>
                {busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <Download aria-hidden="true" size={17} />}<span>Baixar PDF assinado</span>
              </button>
            ) : (
              <>
                {ticket?.remoteSigningAvailable && <button className="button button--yellow" type="button" onClick={() => void signRemotely()} disabled={busy || ticket.status !== "pending"}>{busy ? <LoaderCircle className="spin" aria-hidden="true" size={17} /> : <Cloud aria-hidden="true" size={17} />}<span>Autorizar no PSC</span></button>}
                {ticket?.localSigningAvailable && <button className={ticket.remoteSigningAvailable ? "button button--outline" : "button button--yellow"} type="button" onClick={signWithLocalToken} disabled={busy || ticket.status !== "pending"}><Usb aria-hidden="true" size={17} /><span>Usar token USB</span></button>}
              </>
            )}
            {ticket?.localSigningAvailable && !extensionDetected && (
              <a className="pades-extension-download" href={extensionDownloadUrl}>
                <Download aria-hidden="true" size={16} />
                <span>Baixar extensão Chrome</span>
              </a>
            )}
            <button className="pades-refresh" type="button" onClick={() => token && void refresh(token)} disabled={busy || !token} title="Atualizar estado da assinatura"><RefreshCw aria-hidden="true" size={17} /><span>Atualizar estado</span></button>
          </div>
        </aside>
      </div>
    </section>
  );
}
