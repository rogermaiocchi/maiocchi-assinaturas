"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "./site-chrome";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://documentos.assinatura.maiocchi.adv.br";
const lawyersBase = process.env.NEXT_PUBLIC_LAWYERS_URL || `${documentsBase}/sign_in`;
const icpBase = process.env.NEXT_PUBLIC_ICP_URL || "";

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
    <main>
      <SiteHeader />

      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> Portal seguro de documentos</p>
            <h1>Assine com clareza.<br />Acompanhe com confiança.</h1>
            <p className="hero-lead">
              O ambiente do Maiocchi Advogado para preparar, acompanhar e assinar documentos, com modalidade
              identificada e registro de cada etapa.
            </p>
            <div className="hero-actions">
              <a className="button button--yellow" href="#acessar-documento">Acessar meu documento</a>
              <a className="text-link" href={lawyersBase}>Entrar na gestão <span aria-hidden="true">→</span></a>
            </div>
            <div className="trust-row" aria-label="Características de segurança">
              <span>HTTPS</span><i />
              <span>Trilha de eventos</span><i />
              <span>Documento preservado</span>
            </div>
          </div>

          <aside className="access-card" id="acessar-documento" aria-labelledby="access-title">
            <div className="access-card__top">
              <span className="card-number">01</span>
              <span className="secure-label"><span className="lock-mark" /> Acesso protegido</span>
            </div>
            <h2 id="access-title">Recebeu um documento?</h2>
            <p>Cole abaixo o link completo ou informe o código enviado pelo escritório.</p>
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
                  aria-describedby={error ? "access-error" : "access-help"}
                />
                <button type="submit" aria-label="Continuar para o documento">Continuar <span aria-hidden="true">→</span></button>
              </div>
              <small id="access-help">O código é individual. Não o compartilhe com terceiros.</small>
              {error && <p className="form-error" id="access-error" role="alert">{error}</p>}
            </form>
            <div className="access-card__footer">
              <span>Não recebeu o código?</span>
              <a href="mailto:roger@maiocchi.adv.br?subject=Acesso%20ao%20portal%20de%20assinaturas">Falar com o escritório</a>
            </div>
          </aside>
        </div>
      </section>

      <section className="roles-section">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Do envio à conclusão</p>
            <h2>Um fluxo para cada pessoa.</h2>
            <p>Menos troca de arquivos por e-mail. Mais visibilidade sobre o que falta e o que já foi concluído.</p>
          </div>
          <div className="role-grid">
            <article className="role-card role-card--dark">
              <span className="card-number card-number--light">02</span>
              <p className="role-kicker">Para o escritório</p>
              <h3>Gestão organizada para os advogados.</h3>
              <ul>
                <li>Criar modelos e posicionar campos no PDF</li>
                <li>Definir signatários e ordem de assinatura</li>
                <li>Acompanhar visualização, conclusão e pendências</li>
                <li>Baixar o documento final e o histórico</li>
              </ul>
              <a className="button button--light" href={lawyersBase}>Entrar na área de gestão <span aria-hidden="true">→</span></a>
            </article>
            <article className="role-card role-card--yellow">
              <span className="card-number">03</span>
              <p className="role-kicker">Para clientes e partes</p>
              <h3>Assinatura simples, sem criar conta.</h3>
              <ul>
                <li>Acesso por link individual enviado pelo escritório</li>
                <li>Leitura e preenchimento pelo celular ou computador</li>
                <li>Confirmação de identidade quando exigida</li>
                <li>Cópia do documento concluído</li>
              </ul>
              <a className="button button--dark" href="#acessar-documento">Acessar documento <span aria-hidden="true">→</span></a>
            </article>
          </div>
        </div>
      </section>

      <section className="steps-section" id="como-funciona">
        <div className="shell">
          <div className="section-heading section-heading--row">
            <div>
              <p className="eyebrow">Como funciona</p>
              <h2>Três etapas. Sem complicação.</h2>
            </div>
            <p>O portal conduz cada signatário e registra os eventos relevantes até a conclusão.</p>
          </div>
          <ol className="steps">
            <li><span>1</span><div><h3>Envio</h3><p>O advogado prepara o documento, informa os participantes e envia os convites.</p></div></li>
            <li><span>2</span><div><h3>Identificação e assinatura</h3><p>Cada pessoa acessa seu link, confere o conteúdo e assina nos campos indicados.</p></div></li>
            <li><span>3</span><div><h3>Conclusão</h3><p>O documento final fica disponível com registros de data, horário e eventos do processo.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="security-section" id="seguranca">
        <div className="shell security-grid">
          <div>
            <p className="eyebrow eyebrow--light">Segurança e validade</p>
            <h2>Cada modalidade é identificada pelo que realmente comprova.</h2>
          </div>
          <div className="security-options">
            <article>
              <span className="mode-tag">ELETRÔNICA</span>
              <h3>Assinatura com trilha de eventos</h3>
              <p>O acesso por link e as evidências do DocuSeal são tratados como assinatura simples por padrão. A modalidade adequada depende do documento e do caso concreto.</p>
              <Link className="inline-light-link" href="/assinaturas-eletronicas/">Comparar modalidades <span aria-hidden="true">→</span></Link>
            </article>
            <article>
              <span className="mode-tag mode-tag--yellow">ICP-BRASIL</span>
              <h3>Assinatura digital com certificado</h3>
              <p>Quando habilitada no fluxo, a assinatura qualificada usa certificado ICP-Brasil. A chave privada e o PIN permanecem sob controle do titular.</p>
              {icpBase ? (
                <a className="inline-light-link" href={icpBase}>Acessar área ICP-Brasil <span aria-hidden="true">→</span></a>
              ) : (
                <Link className="inline-light-link" href="/certificacao-digital/">Entender a certificação digital <span aria-hidden="true">→</span></Link>
              )}
            </article>
            <article>
              <span className="mode-tag">GOV.BR</span>
              <h3>Assinatura avançada em serviço oficial</h3>
              <p>O documento pode ser assinado externamente no GOV.BR e depois conferido pelos canais oficiais.</p>
              <Link className="inline-light-link" href="/assinatura-gov-br/">Ver o percurso GOV.BR <span aria-hidden="true">→</span></Link>
            </article>
          </div>
        </div>
      </section>

      <section className="help-cta">
        <div className="shell help-cta__inner">
          <div><p className="eyebrow">Precisa de ajuda?</p><h2>Estamos aqui para orientar.</h2></div>
          <div className="help-actions">
            <Link className="button button--dark" href="/ajuda/">Central de ajuda</Link>
            <a className="text-link" href="mailto:roger@maiocchi.adv.br">roger@maiocchi.adv.br</a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
