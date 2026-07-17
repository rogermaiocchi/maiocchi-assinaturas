import { PageHero } from "./page-hero";
import { SiteFooter, SiteHeader } from "./site-chrome";

type HeroConfiguration = {
  src: string;
  eyebrow: string;
  position: string;
};

const defaultHero: HeroConfiguration = {
  src: "/hero-evidence-gold.webp",
  eyebrow: "Informação institucional",
  position: "center",
};

const heroByPath: Record<string, HeroConfiguration> = {
  "/ajuda/": {
    src: "/hero-support-maiocchi.jpg",
    eyebrow: "Orientação direta",
    position: "center 34%",
  },
  "/assinatura-gov-br/": {
    src: "/hero-security-architecture-4k.webp",
    eyebrow: "Serviço oficial externo",
    position: "center 40%",
  },
  "/assinaturas-eletronicas/": {
    src: "/hero-evidence-gold.webp",
    eyebrow: "Modalidades e evidências",
    position: "center",
  },
  "/certificacao-digital/": {
    src: "/hero-security-architecture-4k.webp",
    eyebrow: "Identidade criptográfica",
    position: "center 38%",
  },
  "/certificado-icp-brasil/": {
    src: "/hero-courthouse-4k.webp",
    eyebrow: "Certificado ICP-Brasil",
    position: "center 44%",
  },
  "/privacidade/": {
    src: "/hero-security-architecture-4k.webp",
    eyebrow: "Proteção de dados",
    position: "center 44%",
  },
  "/seguranca/": {
    src: "/hero-security-architecture-4k.webp",
    eyebrow: "Segurança por projeto",
    position: "center 42%",
  },
  "/termos/": {
    src: "/hero-courthouse-4k.webp",
    eyebrow: "Regras e responsabilidade",
    position: "center 45%",
  },
  "/validar/": {
    src: "/hero-validation-glass.webp",
    eyebrow: "Validação e autenticidade",
    position: "center 44%",
  },
};

export function LegalPage({ title, lead, currentPath, children }: { title: string; lead: string; currentPath: string; children: React.ReactNode }) {
  const hero = heroByPath[currentPath] || defaultHero;

  return (
    <div className="legal-page">
      <SiteHeader />
      <main id="conteudo-principal">
        <PageHero
          title={title}
          lead={lead}
          eyebrow={hero.eyebrow}
          image={hero.src}
          imagePosition={hero.position}
        />
        <section className="shell legal-content">
          <article className="legal-body">{children}</article>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
