import Link from "next/link";
import { ArrowRight, CircleHelp, Home } from "lucide-react";
import { SiteFooter, SiteHeader } from "./site-chrome";

export default function NotFound() {
  return (
    <div className="portal-404">
      <SiteHeader />
      <main className="shell portal-404__content" id="conteudo-principal">
        <p className="eyebrow"><span className="status-dot" /> Erro 404</p>
        <h1>Esta página não foi encontrada.</h1>
        <p>Confira o endereço recebido ou volte ao portal seguro do Maiocchi Advogado.</p>
        <div className="hero-actions">
          <Link className="button button--yellow" href="/"><Home aria-hidden="true" size={18} /><span>Ir para o início</span></Link>
          <Link className="text-link" href="/ajuda/"><CircleHelp aria-hidden="true" size={17} /><span>Central de ajuda</span><ArrowRight aria-hidden="true" size={16} /></Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
