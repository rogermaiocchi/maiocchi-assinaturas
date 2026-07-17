import type { Metadata } from "next";
import { PageHero } from "./page-hero";
import { SiteFooter, SiteHeader } from "./site-chrome";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <div className="legal-page not-found-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <PageHero
          title="Esta página não está disponível."
          lead="Se recebeu um link para assinar, abra-o novamente na mensagem original. Você também pode voltar ao início e informar o código do documento."
          eyebrow="Endereço não encontrado"
          image="/hero-security-architecture-4k.webp"
          currentLabel="Página não encontrada"
          className="page-hero--not-found"
        />
      </main>
      <SiteFooter />
    </div>
  );
}
