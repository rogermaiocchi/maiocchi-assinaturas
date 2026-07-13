"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Download,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Fingerprint,
  LoaderCircle,
  QrCode,
  Search,
  ShieldAlert,
} from "lucide-react";

const apiBase = (process.env.NEXT_PUBLIC_AUTHENTICITY_API_BASE || "").replace(/\/$/, "");
const codePattern = /^MAI-\d{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/;

type AuthenticityEnvelope = {
  record: {
    schema: string;
    version: string;
    document: {
      id: string;
      revision: number;
      mediaType: string;
      size: number;
      hash: { algorithm: "SHA-256"; value: string };
      finalizedAt: string;
    };
    signature: {
      format: "PAdES";
      infrastructure: "ICP-Brasil";
      profile: "AD-RB" | "AD-RT";
      policyOid: string;
      count: number;
      docMdp: "valid";
    };
    validation: {
      status: "valid";
      validatedAt: string;
      validator: string;
      attestation: { type: "JWS"; algorithm: "EdDSA"; keyId: string; hash: { algorithm: "SHA-256"; value: string } };
      report: { mediaType: string; size: number; hash: { algorithm: "SHA-256"; value: string } };
    };
    representation: {
      type: "authenticity-sheet";
      mediaType: string;
      size: number;
      hash: { algorithm: "SHA-256"; value: string };
    };
    goldStandard?: {
      barcodeValue: string;
      intendedFor: string;
      purpose: string;
      signingLocation: string;
      tokenType: string;
      signatureType: string;
      signers: Array<{ name: string; role: string; certificateFingerprintSha256: string; signedAt: string }>;
    };
    disclosure: { mode: "restricted" | "public" };
    links: { verify: string; original: string | null; print: string; officialValidator: string };
  };
  proof: { type: "JWS"; algorithm: "EdDSA"; keyId: string; value: string };
};

type VerificationResponse = {
  documentStatus: "active" | "revoked" | "superseded";
  proofVerified: boolean;
  envelope: AuthenticityEnvelope;
};

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "found"; value: VerificationResponse };

function normalizeCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^MAI(\d{4})([0-9A-HJKMNP-TV-Z]{16})$/);
  if (!match) return value.trim().toUpperCase();
  return `MAI-${match[1]}-${match[2].match(/.{4}/g)?.join("-")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function AuthenticityVerifier({ officialValidatorMode = "external" }: { officialValidatorMode?: "embedded" | "external" }) {
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [fileResult, setFileResult] = useState<"idle" | "checking" | "match" | "mismatch" | "error">("idle");

  const findRecord = useCallback(async (rawCode: string) => {
    const normalized = normalizeCode(rawCode);
    setCode(normalized);
    setFileResult("idle");
    if (!codePattern.test(normalized)) {
      setLookup({ kind: "error", message: "Informe a chave completa no formato MAI-AAAA-XXXX-XXXX-XXXX-XXXX." });
      return;
    }
    setLookup({ kind: "loading" });
    try {
      const response = await fetch(`${apiBase}/verificacao/${encodeURIComponent(normalized)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (response.status === 404) throw new Error("A chave não foi encontrada. Confira cada caractere da via impressa.");
      if (!response.ok || !body?.proofVerified) throw new Error(body?.error?.message || "O registro não pôde ser verificado.");
      setLookup({ kind: "found", value: body as VerificationResponse });
      const query = new URLSearchParams(window.location.search);
      query.set("codigo", normalized);
      window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
    } catch (error) {
      setLookup({ kind: "error", message: error instanceof Error ? error.message : "O serviço de verificação está indisponível." });
    }
  }, []);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("codigo");
    if (!value) return;
    const timer = window.setTimeout(() => void findRecord(value), 0);
    return () => window.clearTimeout(timer);
  }, [findRecord]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void findRecord(code);
  }

  async function compareFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || lookup.kind !== "found") return;
    setFileResult("checking");
    try {
      const digest = await fileSha256(file);
      const result = digest === lookup.value.envelope.record.document.hash.value ? "match" : "mismatch";
      setFileResult(result);
      void fetch(`${apiBase}/verificacao/${encodeURIComponent(lookup.value.envelope.record.document.id)}/evento`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      setFileResult("error");
    } finally {
      event.target.value = "";
    }
  }

  const active = lookup.kind === "found" && lookup.value.documentStatus === "active";
  const record = lookup.kind === "found" ? lookup.value.envelope.record : null;
  const gold = record?.goldStandard || {
    barcodeValue: `${record?.document.id || "MAI"}|LEGACY`,
    intendedFor: "Não informado",
    purpose: "Documento eletrônico",
    signingLocation: "Não informado",
    tokenType: "Não informado",
    signatureType: record ? `${record.signature.format} ${record.signature.profile} - ICP-Brasil` : "PAdES - ICP-Brasil",
    signers: [],
  };

  return (
    <section className="auth-verifier" aria-labelledby="auth-verifier-title">
      <div className="auth-verifier__heading">
        <p className="eyebrow"><QrCode aria-hidden="true" size={14} /> Chave de autenticidade</p>
        <h2 id="auth-verifier-title">Conferir documento eletrônico.</h2>
        <p>Digite a chave impressa ou abra esta página pelo QR Code.</p>
      </div>

      <form className="auth-lookup" onSubmit={submit} noValidate>
        <label htmlFor="authenticity-code">ID do documento</label>
        <div className="auth-lookup__field">
          <input
            id="authenticity-code"
            name="codigo"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MAI-2026-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={lookup.kind === "error"}
          />
          <button type="submit" disabled={lookup.kind === "loading"}>
            {lookup.kind === "loading" ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : <Search aria-hidden="true" size={18} />}
            <span>Verificar</span>
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {lookup.kind === "error" && (
          <p className="auth-feedback auth-feedback--error" role="alert"><ShieldAlert aria-hidden="true" size={19} /><span>{lookup.message}</span></p>
        )}

        {record && lookup.kind === "found" && (
          <div className="auth-result">
            <div className={`auth-result__status ${active ? "is-valid" : "is-warning"}`}>
              {active ? <BadgeCheck aria-hidden="true" size={24} /> : <ShieldAlert aria-hidden="true" size={24} />}
              <div>
                <strong>{active ? "Registro íntegro e ativo" : `Documento ${lookup.value.documentStatus}`}</strong>
                <span>{active ? "A chave foi assinada pelo serviço e corresponde a uma validação PAdES arquivada." : "Não utilize este registro sem orientação do escritório."}</span>
              </div>
            </div>

            <dl className="auth-facts">
              <div><dt>ID</dt><dd>{record.document.id}</dd></div>
              <div><dt>Versão</dt><dd>{record.document.revision}</dd></div>
              <div><dt>Formato</dt><dd>{record.signature.format} · {record.signature.profile}</dd></div>
              <div><dt>Assinaturas</dt><dd>{record.signature.count}</dd></div>
              <div><dt>Finalizado</dt><dd>{formatDate(record.document.finalizedAt)}</dd></div>
              <div><dt>Validado</dt><dd>{formatDate(record.validation.validatedAt)}</dd></div>
              <div><dt>Validador</dt><dd>{record.validation.validator}</dd></div>
              <div><dt>Atestado</dt><dd>{record.validation.attestation.algorithm} · {record.validation.attestation.keyId}</dd></div>
              <div><dt>Tamanho</dt><dd>{formatBytes(record.document.size)}</dd></div>
              <div><dt>Política</dt><dd>{record.signature.policyOid}</dd></div>
              <div><dt>Destinado a</dt><dd>{gold.intendedFor}</dd></div>
              <div><dt>Finalidade</dt><dd>{gold.purpose}</dd></div>
              <div><dt>Assinante</dt><dd>{gold.signers.length ? gold.signers.map((signer) => `${signer.name} (${signer.role})`).join(", ") : "Não informado"}</dd></div>
              <div><dt>Assinado em</dt><dd>{formatDate(gold.signers[0]?.signedAt || record.document.finalizedAt)}</dd></div>
              <div><dt>Local declarado</dt><dd>{gold.signingLocation}</dd></div>
              <div><dt>Token</dt><dd>{gold.tokenType}</dd></div>
              <div><dt>Código de barras</dt><dd>{gold.barcodeValue}</dd></div>
            </dl>

            <div className="auth-hash">
              <span><Fingerprint aria-hidden="true" size={17} /> SHA-256 do PDF eletrônico original</span>
              <code>{record.document.hash.value}</code>
            </div>

            <div className="local-file-check">
              <div>
                <FileSearch aria-hidden="true" size={24} />
                <div><strong>Comparar um PDF neste dispositivo</strong><span>O cálculo ocorre localmente; o arquivo não é enviado ao portal.</span></div>
              </div>
              <label className="button button--dark" htmlFor="local-pdf-comparison">
                <FileCheck2 aria-hidden="true" size={18} />
                <span>Selecionar PDF</span>
                <input id="local-pdf-comparison" type="file" accept="application/pdf,.pdf" onChange={compareFile} />
              </label>
            </div>

            {fileResult !== "idle" && (
              <p className={`auth-feedback ${fileResult === "mismatch" || fileResult === "error" ? "auth-feedback--error" : ""}`}>
                {fileResult === "checking" && <LoaderCircle className="spin" aria-hidden="true" size={19} />}
                {fileResult === "match" && <BadgeCheck aria-hidden="true" size={19} />}
                {fileResult === "mismatch" && <ShieldAlert aria-hidden="true" size={19} />}
                {fileResult === "error" && <ShieldAlert aria-hidden="true" size={19} />}
                <span>{fileResult === "checking" ? "Calculando SHA-256..." : fileResult === "match" ? "O arquivo selecionado corresponde exatamente ao PDF registrado." : fileResult === "mismatch" ? "O arquivo selecionado não corresponde ao hash registrado." : "O navegador não conseguiu calcular o hash do arquivo selecionado."}</span>
              </p>
            )}

            <div className="auth-actions">
              {record.links.original ? (
                <a className="button button--yellow" href={record.links.original}><Download aria-hidden="true" size={18} /><span>Baixar PDF original</span></a>
              ) : (
                <span className="auth-restricted">Original protegido por autorização adicional.</span>
              )}
              <a className="button button--dark" href={record.links.print}><Download aria-hidden="true" size={18} /><span>Baixar folha impressa</span></a>
              {officialValidatorMode === "embedded" ? (
                <a className="button button--outline" href="#validar-iti"><ExternalLink aria-hidden="true" size={17} /><span>Continuar no VALIDAR ITI</span></a>
              ) : (
                <a className="button button--outline" href={record.links.officialValidator} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={17} /><span>Abrir VALIDAR ITI</span></a>
              )}
            </div>

            <details className="auth-json">
              <summary>Consultar chave de autenticidade em JSON</summary>
              <pre>{JSON.stringify(lookup.value.envelope, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
