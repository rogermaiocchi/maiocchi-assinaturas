import Link from "next/link";
import { Brand } from "./brand";

export function LegalPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <header className="site-header"><div className="shell header-inner"><Brand /><Link className="text-link" href="/">Voltar ao portal</Link></div></header>
      <article className="shell legal-content">
        <p className="eyebrow">Maiocchi Assinaturas</p>
        <h1>{title}</h1>
        <p className="legal-lead">{lead}</p>
        <div className="legal-body">{children}</div>
      </article>
      <footer><div className="shell footer-bottom"><span>© {new Date().getFullYear()} Roger Maiocchi, advogado.</span><Link href="/">Início</Link></div></footer>
    </main>
  );
}
