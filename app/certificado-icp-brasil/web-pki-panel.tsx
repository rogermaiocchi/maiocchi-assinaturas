"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { ArrowRight, BadgeCheck, FileKey, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";

const webPkiScript = "https://cdn.lacunasoftware.com/libs/web-pki/lacuna-web-pki-2.16.1.min.js";
const webPkiLicense = process.env.NEXT_PUBLIC_WEB_PKI_LICENSE || "";
const pkiBridgeUrl = process.env.NEXT_PUBLIC_PKI_BRIDGE_URL || "";
const icpAuthUrl = process.env.NEXT_PUBLIC_ICP_URL || "https://assinatura.maiocchi.adv.br/sign_in";
const subscribeToHost = () => () => undefined;

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

type WebPkiError = {
  userMessage?: string;
  message?: string;
  code?: string;
  error?: string;
  origin?: string;
};

type WebPkiOperation<T> = {
  success(callback: (value: T) => void): WebPkiOperation<T>;
  fail(callback: (error: WebPkiError) => void): WebPkiOperation<T>;
};

type CertificateModel = {
  thumbprint: string;
  subjectName: string;
  issuerName: string;
  validityEnd?: Date | string;
  pkiBrazil?: {
    certificateType?: string;
    isPessoaFisica?: boolean;
    isPessoaJuridica?: boolean;
    oabNumero?: string;
    oabUF?: string;
  };
};

type LacunaWebPki = {
  init(options: {
    ready: () => void;
    notInstalled: (status: string, message: string) => void;
    defaultFail: (error: WebPkiError) => void;
  }): WebPkiOperation<object>;
  listCertificates(args?: object): WebPkiOperation<CertificateModel[]>;
  readCertificate(args: { thumbprint: string }): WebPkiOperation<string>;
  signHash(args: { thumbprint: string; hash: string; digestAlgorithm: string }): WebPkiOperation<string>;
  redirectToInstallPage(): void;
};

declare global {
  interface Window {
    LacunaWebPKI?: new (license?: string) => LacunaWebPki;
  }
}

function operationToPromise<T>(operation: WebPkiOperation<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.success(resolve).fail(reject);
  });
}

function webPkiMessage(error: WebPkiError | unknown) {
  if (error && typeof error === "object") {
    const typed = error as WebPkiError;
    return typed.userMessage || typed.message || typed.error || typed.code || "Falha ao acessar o certificado.";
  }
  return "Falha ao acessar o certificado.";
}

function maskThumbprint(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

async function sha256Base64(message: string) {
  const data = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return btoa(String.fromCharCode(...bytes));
}

function certificateKind(certificate: CertificateModel) {
  const brazil = certificate.pkiBrazil;
  if (!brazil) return "Certificado digital";
  const type = brazil.certificateType ? ` ${brazil.certificateType}` : "";
  if (brazil.isPessoaFisica) return `e-CPF${type}`;
  if (brazil.isPessoaJuridica) return `e-CNPJ${type}`;
  return `ICP-Brasil${type}`;
}

function certificateExpiry(certificate: CertificateModel) {
  if (!certificate.validityEnd) return "Validade não informada";
  const date = new Date(certificate.validityEnd);
  if (Number.isNaN(date.getTime())) return "Validade não informada";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function WebPkiPanel() {
  const pkiRef = useRef<LacunaWebPki | null>(null);
  const [status, setStatus] = useState(webPkiLicense
    ? "Aguardando inicialização do Web PKI."
    : "Web PKI disponível somente em teste local até a licença de produção ser configurada.");
  const localHost = useSyncExternalStore(subscribeToHost, isLocalHost, () => false);
  const webPkiAllowed = Boolean(webPkiLicense) || localHost;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [certificates, setCertificates] = useState<CertificateModel[]>([]);
  const [selectedThumbprint, setSelectedThumbprint] = useState("");
  const [testResult, setTestResult] = useState("");

  async function refreshCertificates(pki = pkiRef.current) {
    if (!pki) return;
    setLoading(true);
    setError("");
    setTestResult("");
    try {
      const listed = await operationToPromise(pki.listCertificates());
      setCertificates(listed);
      setSelectedThumbprint((current) => current || listed[0]?.thumbprint || "");
      setStatus(listed.length ? `${listed.length} certificado(s) disponível(is) no navegador.` : "Nenhum certificado disponível foi encontrado.");
    } catch (caught) {
      setError(webPkiMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  function initialize() {
    if (!window.LacunaWebPKI) {
      setError("Biblioteca Web PKI não carregada.");
      return;
    }
    setLoading(true);
    setError("");
    setStatus("Inicializando componente local de certificados.");
    const pki = new window.LacunaWebPKI(webPkiLicense || undefined);
    pkiRef.current = pki;
    pki.init({
      ready: () => {
        setReady(true);
        setStatus("Web PKI pronto. Selecione o certificado ICP-Brasil.");
        void refreshCertificates(pki);
      },
      notInstalled: (_status, message) => {
        setLoading(false);
        setReady(false);
        setStatus("Web PKI não está pronto neste navegador.");
        setError(message || "Instale ou atualize o componente Web PKI para usar o certificado digital.");
      },
      defaultFail: (caught) => {
        setLoading(false);
        setError(webPkiMessage(caught));
      },
    });
  }

  async function testTokenSignature() {
    const pki = pkiRef.current;
    if (!pki || !selectedThumbprint) return;
    setLoading(true);
    setError("");
    setTestResult("");
    try {
      const certificate = await operationToPromise(pki.readCertificate({ thumbprint: selectedThumbprint }));
      const hash = await sha256Base64(`Maiocchi ICP-Brasil teste local ${new Date().toISOString()}`);
      const signature = await operationToPromise(pki.signHash({
        thumbprint: selectedThumbprint,
        hash,
        digestAlgorithm: "SHA-256",
      }));
      setTestResult(`Token assinou o hash de teste. Certificado DER: ${certificate.length} caracteres Base64. Assinatura: ${signature.length} caracteres Base64.`);
      setStatus("Certificado ICP-Brasil operacional para assinatura local de hash.");
    } catch (caught) {
      setError(webPkiMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="icp-console" aria-labelledby="icp-console-title">
      {webPkiAllowed && (
        <Script src={webPkiScript} strategy="afterInteractive" onLoad={initialize} onError={() => setError("Não foi possível carregar a biblioteca Web PKI da Lacuna.")} />
      )}
      <div className="icp-console__header">
        <p className="eyebrow"><span className="status-dot" /> Uso do token local</p>
        <h2 id="icp-console-title">Certificado ICP-Brasil no navegador.</h2>
        <p>
          Esta área lista certificados disponíveis no computador e executa uma assinatura local de hash.
          A assinatura PAdES final depende do `pki-bridge` e do REST PKI Core configurados no fluxo documental.
        </p>
      </div>

      <div className="icp-status-grid">
        <div>
          <span className="mode-tag mode-tag--yellow"><FileKey aria-hidden="true" size={13} /> WEB PKI</span>
          <strong>{ready ? "Componente pronto" : webPkiAllowed ? "Componente em verificação" : "Produção aguardando licença"}</strong>
          <p>{status}</p>
        </div>
        <div>
          <span className="mode-tag"><KeyRound aria-hidden="true" size={13} /> LICENÇA</span>
          <strong>{webPkiLicense ? "Licença de produção configurada" : webPkiAllowed ? "Ambiente local de teste" : "Licença de produção pendente"}</strong>
          <p>{webPkiLicense ? "O build contém licença pública Web PKI para o domínio." : "Sem licença pública, o Web PKI não é carregado no domínio de produção."}</p>
        </div>
        <div>
          <span className="mode-tag"><BadgeCheck aria-hidden="true" size={13} /> PAdES</span>
          <strong>{pkiBridgeUrl ? "Bridge configurado" : "Aguardando bridge produtivo"}</strong>
          <p>{pkiBridgeUrl || "O fechamento PAdES permanece indisponível até o serviço PKI ser conectado e homologado."}</p>
        </div>
      </div>

      <div className="icp-console__actions">
        <button className="button button--yellow" type="button" onClick={() => void refreshCertificates()} disabled={!ready || loading}>
          <RefreshCw aria-hidden="true" size={17} />
          <span>Atualizar certificados</span>
        </button>
        <a className="button button--dark" href={icpAuthUrl}>
          <FileKey aria-hidden="true" size={17} />
          <span>Entrar com certificado</span>
          <ArrowRight aria-hidden="true" size={16} />
        </a>
      </div>

      {error && (
        <p className="icp-message icp-message--error" role="alert">
          <ShieldAlert aria-hidden="true" size={17} />
          <span>{error}</span>
        </p>
      )}
      {testResult && (
        <p className="icp-message">
          <BadgeCheck aria-hidden="true" size={17} />
          <span>{testResult}</span>
        </p>
      )}

      {certificates.length > 0 && (
        <div className="certificate-list" aria-label="Certificados disponíveis">
          {certificates.map((certificate) => (
            <label className="certificate-option" key={certificate.thumbprint}>
              <input
                type="radio"
                name="icp-certificate"
                value={certificate.thumbprint}
                checked={selectedThumbprint === certificate.thumbprint}
                onChange={() => setSelectedThumbprint(certificate.thumbprint)}
              />
              <span>
                <strong>{certificate.subjectName}</strong>
                <small>{certificateKind(certificate)} · emitido por {certificate.issuerName} · válido até {certificateExpiry(certificate)} · {maskThumbprint(certificate.thumbprint)}</small>
              </span>
            </label>
          ))}
        </div>
      )}

      <button className="button button--dark" type="button" onClick={() => void testTokenSignature()} disabled={!ready || !selectedThumbprint || loading}>
        <KeyRound aria-hidden="true" size={17} />
        <span>Testar assinatura com o token</span>
      </button>
    </section>
  );
}
