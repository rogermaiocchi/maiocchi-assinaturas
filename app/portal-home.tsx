"use client";

import { FormEvent, PointerEvent, useState } from "react";
import Link from "next/link";
import {
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
    if (["s", "d", "e", "p"].includes(segments.at(-2) || "")) {
      route = segments.at(-2) || route;
    }
  } catch {
    const segments = value.split("/").filter(Boolean);
    slug = segments.at(-1) || "";
    if (["s", "d", "e", "p"].includes(segments.at(-2) || "")) {
      route = segments.at(-2) || route;
    }
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
    if (!accessDocument(code)) {
      setError("Confira o link ou código recebido e tente novamente.");
    }
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
    <div className="portal-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <section className="hero" onPointerMove={moveHero} onPointerLeave={resetHero}>
          <div className="hero__media" aria-hidden="true" />
          <div className="hero__shade" aria-hidden="true" />
          <div className="shell hero__content">
            <div className="hero-copy">
              <p className="eyebrow"><span className="status-dot" /> Portal oficial do escritório</p>
              <h1>Maiocchi <span>Assinaturas.</span></h1>
              <p className="hero-lead">Abra, assine e valide documentos em um único endereço.</p>

              <form className="hero-access" id="acessar-documento" onSubmit={onSubmit} noValidate aria-labelledby="access-title">
                <div className="hero-access__heading">
                  <div>
                    <span className="secure-label"><LockKeyhole aria-hidden="true" size={14} /> Acesso protegido</span>
                    <h2 id="access-title">Recebeu um documento?</h2>
                  </div>
                  <span className="hero-access__mark" aria-hidden="true">m<i>.</i></span>
                </div>
                <label htmlFor="document-code">Cole o link ou informe o código enviado pelo escritório</label>
                <div className={`code-field${error ? " code-field--error" : ""}`}>
                  <input
                    id="document-code"
                    name="document-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Ex.: A7K9-M2P4"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "access-error" : "access-help"}
                  />
                  <button type="submit">
                    <span>Abrir documento</span>
                    <Send aria-hidden="true" size={17} />
                  </button>
                </div>
                <small id="access-help">O código é individual. Não o compartilhe.</small>
                {error && <p className="form-error" id="access-error" role="alert">{error}</p>}
              </form>

              <div className="hero-actions">
                <Link className="button button--yellow" href="/#advogados">
                  <FolderKanban aria-hidden="true" size={18} />
                  <span>Entrar como advogado</span>
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
                <Link className="button button--glass" href="/#validar">
                  <ScanSearch aria-hidden="true" size={18} />
                  <span>Validar documento</span>
                </Link>
              </div>

              <div className="trust-row" aria-label="Proteções do portal">
                <span><ShieldCheck aria-hidden="true" size={15} /> Conexão TLS</span>
                <span><BadgeCheck aria-hidden="true" size={15} /> Eventos registrados</span>
                <span><FileKey aria-hidden="true" size={15} /> ICP-Brasil</span>
              </div>
            </div>
          </div>
        </section>

        <section className="service-strip" aria-label="Navegação visual por objetivo">
          <div className="shell service-strip__grid">
            <Link href="/#acessar-documento">
              <span className="service-strip__index">01</span>
              <span className="service-strip__icon"><PenLine aria-hidden="true" size={21} /></span>
              <span><small>Recebi um link</small><strong>Assinar documento</strong></span>
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link href="/#validar">
              <span className="service-strip__index">02</span>
              <span className="service-strip__icon service-strip__icon--yellow"><FileCheck2 aria-hidden="true" size={21} /></span>
              <span><small>Tenho o PDF ou a chave</small><strong>Validar autenticidade</strong></span>
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link href="/#advogados">
              <span className="service-strip__index">03</span>
              <span className="service-strip__icon"><FolderKanban aria-hidden="true" size={21} /></span>
              <span><small>Sou advogado</small><strong>Gerenciar documentos</strong></span>
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </section>

        <section className="workspace-section" id="advogados">
          <div className="shell">
            <LawyerAccess />
          </div>
        </section>

        <section className="verification-section" id="validar">
          <div className="shell verification-section__inner">
            <div className="section-heading">
              <div>
                <p className="eyebrow"><BadgeCheck aria-hidden="true" size={14} /> Validação integrada</p>
                <h2>Confira a autenticidade sem abandonar o portal.</h2>
              </div>
              <p>Consulte a chave Maiocchi, compare localmente o SHA-256 do PDF e, em seguida, utilize o serviço oficial do ITI incorporado abaixo.</p>
            </div>
            <AuthenticityVerifier officialValidatorMode="embedded" />
            <section className="iti-validator" id="validar-iti" aria-labelledby="iti-validator-title">
              <div className="iti-validator__heading">
                <div>
                  <p className="eyebrow"><Landmark aria-hidden="true" size={14} /> Serviço oficial</p>
                  <h3 id="iti-validator-title">VALIDAR ITI</h3>
                  <p>O conteúdo abaixo é fornecido diretamente por <strong>validar.iti.gov.br</strong>. Arquivos submetidos seguem os termos e o processamento do serviço oficial.</p>
                </div>
                <a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer" title="Abrir VALIDAR ITI em nova aba">
                  <ExternalLink aria-hidden="true" size={18} />
                  <span>Abrir em nova aba</span>
                </a>
              </div>
              <div className="iti-validator__frame">
                <iframe
                  src="https://validar.iti.gov.br/"
                  title="Validador oficial de assinaturas do Instituto Nacional de Tecnologia da Informação"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="clipboard-read; clipboard-write"
                />
              </div>
            </section>
          </div>
        </section>

        <section className="steps-section" id="como-funciona">
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

        <section className="security-section" id="modalidades">
          <div className="shell security-grid">
            <div>
              <p className="eyebrow eyebrow--light">Modalidade adequada</p>
              <h2>Uma escolha jurídica, não apenas técnica.</h2>
              <p className="security-intro">O portal indica o caminho aplicável e mantém as alternativas no mesmo contexto, sem obrigar o usuário a percorrer sucessivas páginas.</p>
            </div>
            <div className="security-options">
              <details open>
                <summary><span><FileSignature aria-hidden="true" size={18} /> Eletrônica</span><strong>Fluxo com trilha de eventos</strong></summary>
                <div><p>O aceite por link registra as evidências do fluxo. A classificação jurídica depende do documento e do método de identificação.</p><Link className="inline-light-link" href="/assinaturas-eletronicas/">Entender as modalidades <ArrowRight aria-hidden="true" size={15} /></Link></div>
              </details>
              <details>
                <summary><span><FileKey aria-hidden="true" size={18} /> ICP-Brasil</span><strong>Assinatura digital qualificada</strong></summary>
                <div><p>O certificado A1, A3 ou em nuvem assina o PDF com a chave privada sob controle do titular.</p><Link className="inline-light-link" href="/certificado-icp-brasil/">Usar certificado ICP-Brasil <ArrowRight aria-hidden="true" size={15} /></Link></div>
              </details>
              <details>
                <summary><span><Landmark aria-hidden="true" size={18} /> GOV.BR</span><strong>Assinatura avançada oficial</strong></summary>
                <div><p>Quando aplicável, o documento segue ao serviço oficial e retorna para conferência e preservação.</p><Link className="inline-light-link" href="/assinatura-gov-br/">Ver percurso GOV.BR <ArrowRight aria-hidden="true" size={15} /></Link></div>
              </details>
            </div>
          </div>
        </section>

        <section className="help-cta">
          <div className="shell help-cta__inner">
            <div><p className="eyebrow">Atendimento direto</p><h2>Dúvida sobre acesso ou validade?</h2></div>
            <div className="help-actions">
              <Link className="button button--dark" href="/ajuda/"><CircleHelp aria-hidden="true" size={18} /><span>Central de ajuda</span></Link>
              <Link className="text-link" href="/#advogados"><FolderKanban aria-hidden="true" size={17} /><span>Acesso profissional</span></Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
