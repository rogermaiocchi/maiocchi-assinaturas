import Link from "next/link";
import { Brand } from "./brand";

export default function NotFound() {
  return (
    <main className="portal-404">
      <header className="site-header">
        <div className="shell header-inner">
          <Brand />
          <Link className="text-link" href="/">Voltar ao portal</Link>
        </div>
      </header>
      <section className="shell portal-404__content">
        <p className="eyebrow"><span className="status-dot" /> Erro 404</p>
        <h1>Esta página não foi encontrada.</h1>
        <p>Confira o endereço recebido ou volte ao portal seguro de Roger Maiocchi, advogado.</p>
        <div className="hero-actions">
          <Link className="button button--yellow" href="/">Ir para o início</Link>
          <Link className="text-link" href="/ajuda/">Central de ajuda <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
