import Link from "next/link";
import { LogIn, Menu } from "lucide-react";
import { Brand } from "./brand";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://documentos.assinatura.maiocchi.adv.br";
const lawyersBase = process.env.NEXT_PUBLIC_LAWYERS_URL || `${documentsBase}/sign_in`;

const mainNav = [
  ["/assinaturas-eletronicas/", "Modalidades"],
  ["/assinatura-gov-br/", "GOV.BR"],
  ["/validar/", "Validar"],
  ["/seguranca/", "Segurança"],
  ["/ajuda/", "Ajuda"],
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Navegação principal">
          {mainNav.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <details className="mobile-nav">
          <summary title="Abrir navegação" aria-label="Abrir navegação">
            <Menu aria-hidden="true" size={21} />
          </summary>
          <nav aria-label="Navegação móvel">
            <Link href="/">Início</Link>
            {mainNav.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
          </nav>
        </details>
        <a className="button button--dark button--small header-login" href={lawyersBase} title="Área dos advogados">
          <LogIn aria-hidden="true" size={16} />
          <span>Área dos advogados</span>
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="shell footer-main">
        <Brand compact />
        <p>Portal de documentos e assinaturas do Maiocchi Advogado. Responsável: Roger Maiocchi, OAB/DF 31.249.</p>
        <nav className="footer-links" aria-label="Navegação institucional">
          <Link href="/assinaturas-eletronicas/">Modalidades</Link>
          <Link href="/assinatura-gov-br/">GOV.BR</Link>
          <Link href="/validar/">Validar</Link>
          <Link href="/privacidade/">Privacidade</Link>
          <Link href="/termos/">Termos</Link>
          <Link href="/codigo-fonte/">Código-fonte</Link>
        </nav>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Maiocchi Advogado</span>
        <a href="mailto:roger@maiocchi.adv.br">roger@maiocchi.adv.br</a>
      </div>
    </footer>
  );
}
