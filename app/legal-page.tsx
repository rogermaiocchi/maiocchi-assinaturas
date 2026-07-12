import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { NextActions, PortalSectionNav } from "./portal-navigation";

export function LegalPage({ title, lead, currentPath, children }: { title: string; lead: string; currentPath: string; children: React.ReactNode }) {
  return (
    <div className="legal-page">
      <SiteHeader />
      <section className="page-hero" aria-labelledby="page-title">
        <div className="page-hero__media" aria-hidden="true" />
        <div className="shell page-hero__content">
          <nav className="breadcrumb" aria-label="Navegação estrutural">
            <Link href="/"><Home aria-hidden="true" size={14} /><span>Portal</span></Link>
            <ChevronRight aria-hidden="true" size={13} />
            <span aria-current="page">{title}</span>
          </nav>
          <p className="eyebrow"><span className="status-dot" /> Maiocchi Assinaturas</p>
          <h1 id="page-title">{title}</h1>
          <p className="legal-lead">{lead}</p>
        </div>
      </section>
      <PortalSectionNav currentPath={currentPath} />
      <main className="shell legal-content" id="conteudo-principal">
        <div className="legal-body">{children}</div>
        <NextActions currentPath={currentPath} />
      </main>
      <SiteFooter />
    </div>
  );
}
