import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ChevronRight, Home } from "lucide-react";

type PageHeroProps = {
  title: string;
  lead: string;
  eyebrow: string;
  image: string;
  imagePosition?: string;
  currentLabel?: string;
  className?: string;
  titleId?: string;
};

export function PageHero({
  title,
  lead,
  eyebrow,
  image,
  imagePosition = "center",
  currentLabel = title,
  className = "",
  titleId = "page-title",
}: PageHeroProps) {
  const heroStyle = { "--hero-position": imagePosition } as CSSProperties;

  return (
    <section
      className={`page-hero page-hero--dark${className ? ` ${className}` : ""}`}
      style={heroStyle}
      aria-labelledby={titleId}
    >
      <div className="page-hero__media" aria-hidden="true">
        <Image src={image} alt="" fill priority sizes="100vw" quality={92} />
      </div>
      <div className="page-hero__shade" aria-hidden="true" />
      <div className="shell page-hero__content">
        <nav className="breadcrumb" aria-label="Caminho da página">
          <Link href="/">
            <Home aria-hidden="true" size={14} />
            <span>Portal</span>
          </Link>
          <ChevronRight aria-hidden="true" size={13} />
          <span aria-current="page">{currentLabel}</span>
        </nav>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
        <p className="legal-lead">{lead}</p>
      </div>
    </section>
  );
}
