import type { Metadata } from "next";
import { PageHero } from "../page-hero";
import { SiteFooter, SiteHeader } from "../site-chrome";
import { PrivatePadesPanel } from "./private-pades-panel";

export const metadata: Metadata = { title: "Assinar com ICP-Brasil" };

export default function PrivatePadesSigningPage() {
  return (
    <div className="signing-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <PageHero
          title="Assinar com ICP-Brasil"
          lead="Confira o documento e escolha a modalidade disponível para concluir a assinatura PAdES."
          eyebrow="Certificado digital"
          image="/hero-security-architecture-4k.webp"
          imagePosition="center 40%"
        />
        <section className="signing-workspace-band">
          <div className="shell"><PrivatePadesPanel /></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
