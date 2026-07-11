import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand${compact ? " brand--compact" : ""}`} href="/" aria-label="Maiocchi Advogado, portal de assinaturas — início">
      <span className="brand__word">MAIOCCHI</span><span className="brand__dot" aria-hidden="true">.</span>
      {!compact && <span className="brand__product">ASSINATURAS</span>}
    </Link>
  );
}
