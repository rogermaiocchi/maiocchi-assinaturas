import type { Metadata } from "next";
import { FileKey } from "lucide-react";
import { SiteFooter, SiteHeader } from "../site-chrome";
import { PrivatePadesPanel } from "./private-pades-panel";

export const metadata: Metadata = { title: "Assinar com ICP-Brasil" };

export default function PrivatePadesSigningPage() {
  return (
    <div className="signing-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <section className="signing-masthead" aria-labelledby="signing-title">
          <div className="signing-masthead__media" aria-hidden="true" />
          <div className="signing-masthead__shade" aria-hidden="true" />
          <div className="shell signing-masthead__content">
            <p className="eyebrow"><FileKey aria-hidden="true" size={14} /> Certificado digital</p>
            <h1 id="signing-title">Assinar com ICP-Brasil</h1>
            <p>Confira o documento e escolha a modalidade disponível para concluir a assinatura PAdES.</p>
          </div>
        </section>
        <section className="signing-workspace-band">
          <div className="shell"><PrivatePadesPanel /></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
