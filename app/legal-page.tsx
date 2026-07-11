import Link from "next/link";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { NextActions, PortalSectionNav } from "./portal-navigation";

export function LegalPage({ title, lead, currentPath, children }: { title: string; lead: string; currentPath: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <SiteHeader />
      <PortalSectionNav currentPath={currentPath} />
      <article className="shell legal-content">
        <nav className="breadcrumb" aria-label="Navegação estrutural">
          <Link href="/">Portal</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span>
        </nav>
        <p className="eyebrow">Maiocchi Advogado · Assinaturas</p>
        <h1>{title}</h1>
        <p className="legal-lead">{lead}</p>
        <div className="legal-body">{children}</div>
        <NextActions currentPath={currentPath} />
      </article>
      <SiteFooter />
    </main>
  );
}
