import { SiteFooter, SiteHeader } from "./site-chrome";

export function LegalPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <SiteHeader back />
      <article className="shell legal-content">
        <p className="eyebrow">Maiocchi Advogado · Assinaturas</p>
        <h1>{title}</h1>
        <p className="legal-lead">{lead}</p>
        <div className="legal-body">{children}</div>
      </article>
      <SiteFooter />
    </main>
  );
}
