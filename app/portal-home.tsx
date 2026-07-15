"use client";

import { FormEvent, PointerEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  ExternalLink,
  FileCheck2,
  FileKey,
  FilePlus2,
  FileSignature,
  FolderKanban,
  Landmark,
  LockKeyhole,
  PenLine,
  PenTool,
  ScanSearch,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { FlowMap } from "./flow-map";
import { LawyerAccess } from "./lawyer-access";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { AuthenticityVerifier } from "./validar/authenticity-verifier";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://assinatura.maiocchi.adv.br";

function accessDocument(raw: string) {
  const value = raw.trim();
  if (!value) return false;

  let slug = value;
  let route = "s";
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    slug = segments.at(-1) || "";
    if (["s", "d", "e", "p"].includes(segments.at(-2) || "")) route = segments.at(-2) || route;
  } catch {
    const segments = value.split("/").filter(Boolean);
    slug = segments.at(-1) || "";
    if (["s", "d", "e", "p"].includes(segments.at(-2) || "")) route = segments.at(-2) || route;
  }

  if (!/^[a-zA-Z0-9_-]{6,160}$/.test(slug)) return false;
  window.location.assign(`${documentsBase}/${route}/${encodeURIComponent(slug)}`);
  return true;
}

export function PortalHome() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!accessDocument(code)) setError("Confira o link ou código recebido e tente novamente.");
  }

  function moveHero(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--depth-x", x.toFixed(3));
    event.currentTarget.style.setProperty("--depth-y", y.toFixed(3));
  }

  function resetHero(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--depth-x", "0");
    event.currentTarget.style.setProperty("--depth-y", "0");
  }

  return (
    <div className="portal-page portal-page--editorial">
      <SiteHeader />
      <main id="conteudo-principal">
        <section className="hero hero--institutional" onPointerMove={moveHero} onPointerLeave={resetHero}>
          <div className="hero__media" aria-hidden="true" />
          <div className="hero__shade" aria-hidden="true" />
          <div className="shell hero__content">
            <div className="hero-copy">
              <p className="eyebrow"><span className="status-dot" /> Serviço de apoio ao cliente</p>
              <h1 className="hero-title">Assinatura digital</h1>
              <p className="hero-lead">Abra, assine e valide documentos em um único endereço.</p>

              <form className="hero-access" id="acessar-documento" onSubmit={onSubmit} noValidate aria-labelledby="access-title">
                <div className="hero-access__heading">
                  <span className="secure-label"><LockKeyhole aria-hidden="true" size={14} /> Acesso protegido</span>
                  <h2 id="access-title">Recebeu um documento?</h2>
                </div>
                <label className="sr-only" htmlFor="document-code">Cole o link ou informe o código enviado pelo escritório</label>
                <div className={`code-field${error ? " code-field--error" : ""}`}>
                  <input
                    id="document-code"
                    name="document-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Cole o link ou informe o código"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "access-error" : "access-help"}
                  />
                  <button type="submit" aria-label="Abrir documento">
                    <span>Abrir</span>
                    <Send aria-hidden="true" size={17} />
                  </button>
                </div>
                <small id="access-help">O código é individual. Não o compartilhe.</small>
                {error && <p className="form-error" id="access-error" role="alert">{error}</p>}
              </form>

              <nav className="hero-actions" aria-label="Acessos rápidos">
                <Link className="hero-text-link" href="/#advogados"><FolderKanban aria-hidden="true" size={18} /><span>Área dos advogados</span><ArrowRight aria-hidden="true" size={15} /></Link>
                <Link className="hero-text-link" href="/#validar"><ScanSearch aria-hidden="true" size={18} /><span>Validar documento</span><ArrowRight aria-hidden="true" size={15} /></Link>
              </nav>

              <div className="trust-row" aria-label="Proteções do portal">
                <span><ShieldCheck aria-hidden="true" size={15} /> Conexão TLS</span>
                <span><BadgeCheck aria-hidden="true" size={15} /> Eventos registrados</span>
                <span><FileKey aria-hidden="true" size={15} /> ICP-Brasil</span>
              </div>
            </div>
          </div>
          <a className="hero-scroll" href="#operacoes" aria-label="Ir para os serviços do portal"><ArrowDown aria-hidden="true" size={19} /></a>
        </section>

        <nav className="operation-rail" id="operacoes" aria-label="Escolha o que deseja fazer">
          <div className="shell operation-rail__inner">
            <Link href="/#acessar-documento"><span className="operation-rail__number">01</span><PenLine aria-hidden="true" size={22} /><span><small>Recebi um link</small><strong>Assinar</strong></span><ArrowRight aria-hidden="true" size={17} /></Link>
            <Link href="/#validar"><span className="operation-rail__number">02</span><FileCheck2 aria-hidden="true" size={22} /><span><small>Tenho o PDF ou a chave</small><strong>Validar</strong></span><ArrowRight aria-hidden="true" size={17} /></Link>
            <Link href="/#advogados"><span className="operation-rail__number">03</span><FolderKanban aria-hidden="true" size={22} /><span><small>Sou advogado</small><strong>Gerenciar</strong></span><ArrowRight aria-hidden="true" size={17} /></Link>
          </div>
        </nav>

        <section className="portal-band portal-band--workspace" id="advogados">
          <div className="shell"><LawyerAccess /></div>
        </section>

        <section className="portal-band portal-band--verification" id="validar">
          <div className="shell">
            <div className="editorial-heading">
              <div><p className="eyebrow"><BadgeCheck aria-hidden="true" size={14} /> Validação integrada</p><h2>Autenticidade conferida no mesmo percurso.</h2></div>
              <p>Consulte a chave Maiocchi, compare o SHA-256 do PDF e, quando aplicável, prossiga para o serviço oficial do ITI.</p>
            </div>
            <AuthenticityVerifier officialValidatorMode="embedded" />
            <details className="official-validator" id="validar-iti">
              <summary><span><Landmark aria-hidden="true" size={20} /><span><small>Serviço oficial externo</small><strong>VALIDAR ITI</strong></span></span><span className="official-validator__action">Abrir verificador <ArrowDown aria-hidden="true" size={17} /></span></summary>
              <div className="official-validator__body">
                <div className="official-validator__notice">
                  <p>O conteúdo abaixo é fornecido por <strong>validar.iti.gov.br</strong>. Caso o serviço impeça a incorporação, abra-o em uma nova aba.</p>
                  <a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={17} /><span>Abrir validar.iti.gov.br</span></a>
                </div>
                <div className="official-validator__frame"><iframe src="https://validar.iti.gov.br/" title="Validador oficial de assinaturas do Instituto Nacional de Tecnologia da Informação" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write" /></div>
              </div>
            </details>
          </div>
        </section>

        <section className="portal-band portal-band--process" id="como-funciona">
          <div className="shell">
            <FlowMap
              eyebrow="Fluxo único"
              title="Do envio à prova de autenticidade."
              description="Cada etapa permanece conectada ao documento original, às evidências do fluxo e ao verificador do portal."
              ariaLabel="Fluxo de preparação, acesso, assinatura e validação do documento"
              steps={[
                { title: "Preparar", description: "O advogado define documento, participantes e modalidade.", icon: FilePlus2 },
                { title: "Identificar", description: "O signatário acessa o link individual e confere o conteúdo.", icon: UserRoundCheck },
                { title: "Assinar", description: "A manifestação ocorre na modalidade indicada para o caso.", icon: PenTool, tone: "yellow" },
                { title: "Validar", description: "PDF, hash, QR Code e histórico conduzem à conferência.", icon: BadgeCheck, href: "/#validar", linkLabel: "Validar agora" },
              ]}
            />
          </div>
        </section>

        <section className="portal-band portal-band--modalities" id="modalidades">
          <div className="shell modalities-layout">
            <div className="modalities-layout__intro"><p className="eyebrow">Modalidade adequada</p><h2>Uma escolha jurídica, não apenas técnica.</h2><p>O portal mantém as alternativas no mesmo contexto e indica o percurso aplicável ao documento.</p></div>
            <div className="modality-list">
              <details open><summary><span><FileSignature aria-hidden="true" size={19} /> Eletrônica</span><strong>Fluxo com trilha de eventos</strong></summary><div><p>O aceite por link registra as evidências do fluxo. A classificação jurídica depende do documento e do método de identificação.</p><Link href="/assinaturas-eletronicas/">Entender modalidades <ArrowRight aria-hidden="true" size={15} /></Link></div></details>
              <details><summary><span><FileKey aria-hidden="true" size={19} /> ICP-Brasil</span><strong>Assinatura digital qualificada</strong></summary><div><p>O certificado A3 em nuvem assina no ambiente protegido do PSC, sem instalar componentes e sempre sob autorização do titular.</p><Link href="/certificado-icp-brasil/">Usar certificado <ArrowRight aria-hidden="true" size={15} /></Link></div></details>
              <details><summary><span><Landmark aria-hidden="true" size={19} /> GOV.BR</span><strong>Assinatura avançada oficial</strong></summary><div><p>Quando aplicável, o documento segue ao serviço oficial e retorna para conferência e preservação.</p><Link href="/assinatura-gov-br/">Ver percurso GOV.BR <ArrowRight aria-hidden="true" size={15} /></Link></div></details>
            </div>
          </div>
        </section>

        <section className="help-cta" aria-labelledby="help-cta-title">
          <div className="shell help-cta__inner">
            <div className="help-cta__copy"><p className="eyebrow">Atendimento direto</p><h2 id="help-cta-title">Orientação para acessar, assinar e validar.</h2><p>Instruções objetivas sobre documentos recebidos, certificado digital, autenticidade e dificuldades de acesso.</p><Link className="hero-text-link" href="/ajuda/"><CircleHelp aria-hidden="true" size={19} /><span>Acessar central de ajuda</span><ArrowRight aria-hidden="true" size={16} /></Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
