"use client";

import { PageHero } from "./page-hero";
import { SiteFooter, SiteHeader } from "./site-chrome";

export function PortalErrorState() {
  return (
    <div className="legal-page not-found-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <PageHero
          title="Não foi possível abrir esta página."
          lead="Abra novamente o endereço original. Se a indisponibilidade continuar, retorne ao portal e use o link ou código recebido."
          eyebrow="Falha temporária"
          image="/hero-security-architecture-4k.webp"
          currentLabel="Página indisponível"
          className="page-hero--not-found"
        />
      </main>
      <SiteFooter />
    </div>
  );
}
