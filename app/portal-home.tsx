"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  FileCheck2,
  FileKey,
  FilePlus2,
  FileSignature,
  FolderKanban,
  Landmark,
  LockKeyhole,
  Mail,
  PenTool,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { FlowMap } from "./flow-map";
import { SiteFooter, SiteHeader } from "./site-chrome";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://assinatura.maiocchi.adv.br";
const lawyersBase = process.env.NEXT_PUBLIC_LAWYERS_URL || `${documentsBase}/dashboard`;

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

  return (
    <div className="portal-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <section className="hero">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><span className="status-dot" /> Maiocchi Assinaturas</p>
              <h1>Acesse e assine seu documento.</h1>
              <p className="hero-lead">
                Um único ambiente para conferir, preencher e assinar documentos enviados pelo Maiocchi Advogado,
                com a modalidade indicada em cada fluxo.
              </p>
              <div className="trust-row" aria-label="Características do portal">
                <span><ShieldCheck aria-hidden="true" size={15} /> Conexão TLS</span><i />
                <span><BadgeCheck aria-hidden="true" size={15} /> Eventos registrados</span><i />
                <span><FileKey aria-hidden="true" size={15} /> Arquivo final</span>
              </div>
              <a className="text-link hero-professional-link" href={lawyersBase}>
                <FolderKanban aria-hidden="true" size={18} />
                <span>Entrar na área dos advogados</span>
                <ArrowRight aria-hidden="true" size={16} />
              </a>
            </div>

            <aside className="access-card" id="acessar-documento" aria-labelledby="access-title">
              <div className="access-card__top">
                <Image className="access-card__mark" src="/icon-512.png" alt="" width={512} height={512} />
                <span className="secure-label"><LockKeyhole aria-hidden="true" size={15} /> Acesso protegido</span>
              </div>
              <h2 id="access-title">Recebeu um documento?</h2>
              <p>Cole o link completo ou informe o código enviado pelo escritório.</p>
              <form onSubmit={onSubmit} noValidate>
                <label htmlFor="document-code">Link ou código de acesso</label>
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
                <small id="access-help">O código é individual. Não o compartilhe com terceiros.</small>
                {error && <p className="form-error" id="access-error" role="alert">{error}</p>}
              </form>
              <div className="access-card__footer">
                <span>Não recebeu o código?</span>
                <a href="mailto:roger@maiocchi.adv.br?subject=Acesso%20ao%20portal%20de%20assinaturas">
                  <Mail aria-hidden="true" size={15} />
                  <span>Falar com o escritório</span>
                </a>
              </div>
            </aside>
          </div>
        </section>

        <section className="service-strip" aria-label="Acessos rápidos">
          <div className="shell service-strip__grid">
            <a href={lawyersBase}>
              <span className="service-strip__icon"><FolderKanban aria-hidden="true" size={22} /></span>
              <span>
                <small>Para o escritório</small>
                <strong>Área dos advogados</strong>
                <span>Crie, envie e acompanhe os fluxos documentais.</span>
              </span>
              <ArrowRight aria-hidden="true" size={18} />
            </a>
            <Link href="/validar/">
              <span className="service-strip__icon service-strip__icon--yellow"><FileCheck2 aria-hidden="true" size={22} /></span>
              <span>
                <small>Depois da assinatura</small>
                <strong>Validar um documento</strong>
                <span>Confira o arquivo pelos canais adequados à modalidade.</span>
              </span>
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </section>

        <section className="steps-section" id="como-funciona">
          <div className="shell">
            <FlowMap
              eyebrow="Como funciona"
              title="Do preparo à preservação."
              description="O percurso deixa claro quem age em cada etapa e quais evidências devem acompanhar o documento concluído."
              ariaLabel="Fluxo de preparação, acesso, assinatura e preservação do documento"
              steps={[
                { title: "Preparar", description: "O advogado configura o documento, os participantes e a ordem do fluxo.", icon: FilePlus2 },
                { title: "Identificar", description: "Cada pessoa entra pelo link individual e confere seus dados e o conteúdo.", icon: UserRoundCheck },
                { title: "Assinar", description: "O signatário manifesta sua vontade na modalidade indicada para o caso.", icon: PenTool, tone: "yellow" },
                { title: "Preservar", description: "O arquivo final e seu histórico ficam disponíveis para conferência e guarda.", icon: BadgeCheck, href: "/validar/", linkLabel: "Como validar" },
              ]}
            />
          </div>
        </section>

        <section className="security-section" id="seguranca">
          <div className="shell security-grid">
            <div>
              <p className="eyebrow eyebrow--light">Modalidades</p>
              <h2>A modalidade depende do documento.</h2>
              <p className="security-intro">O portal distingue o aceite eletrônico, a assinatura com certificado ICP-Brasil e o percurso externo do GOV.BR.</p>
            </div>
            <div className="security-options">
              <article>
                <span className="mode-tag"><FileSignature aria-hidden="true" size={13} /> ELETRÔNICA</span>
                <h3>Assinatura com trilha de eventos</h3>
                <p>O acesso por link e as evidências do DocuSeal são tratados como assinatura simples por padrão. A modalidade adequada depende do caso concreto.</p>
                <Link className="inline-light-link" href="/assinaturas-eletronicas/">
                  <span>Comparar modalidades</span>
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </article>
              <article>
                <span className="mode-tag mode-tag--yellow"><FileKey aria-hidden="true" size={13} /> ICP-BRASIL</span>
                <h3>Assinatura digital com certificado</h3>
                <p>Quando habilitada no fluxo, a assinatura qualificada usa certificado ICP-Brasil. A chave privada e o PIN permanecem sob controle do titular.</p>
                <Link className="inline-light-link" href="/certificado-icp-brasil/">
                  <span>Usar certificado ICP-Brasil</span>
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </article>
              <article>
                <span className="mode-tag"><Landmark aria-hidden="true" size={13} /> GOV.BR</span>
                <h3>Assinatura avançada em serviço oficial</h3>
                <p>O documento pode ser assinado externamente no GOV.BR e depois conferido pelos canais oficiais.</p>
                <Link className="inline-light-link" href="/assinatura-gov-br/">
                  <span>Ver o percurso GOV.BR</span>
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="help-cta">
          <div className="shell help-cta__inner">
            <div><p className="eyebrow">Precisa de ajuda?</p><h2>Orientação direta, sem atalhos inseguros.</h2></div>
            <div className="help-actions">
              <Link className="button button--dark" href="/ajuda/">
                <CircleHelp aria-hidden="true" size={18} />
                <span>Central de ajuda</span>
              </Link>
              <a className="text-link" href="mailto:roger@maiocchi.adv.br">
                <Mail aria-hidden="true" size={17} />
                <span>roger@maiocchi.adv.br</span>
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
