import Link from "next/link";
import { Brand } from "./brand";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://documentos.assinatura.maiocchi.adv.br";
const lawyersBase = process.env.NEXT_PUBLIC_LAWYERS_URL || `${documentsBase}/sign_in`;

export function SiteHeader({ back = false }: { back?: boolean }) {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Brand />
        {back ? (
          <Link className="text-link header-back" href="/">Voltar ao portal</Link>
        ) : (
          <>
            <nav aria-label="Navegação principal">
              <Link href="/assinaturas-eletronicas/">Modalidades</Link>
              <Link href="/certificacao-digital/">Certificação digital</Link>
              <Link href="/seguranca/">Segurança</Link>
              <Link href="/ajuda/">Ajuda</Link>
            </nav>
            <a className="button button--dark button--small" href={lawyersBase}>Área dos advogados</a>
          </>
        )}
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
