import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand${compact ? " brand--compact" : ""}`} href="/">
      <span className="brand__mark" aria-hidden="true">
        <span>m</span><i>.</i>
      </span>
      <span className="brand__name">
        <strong>Maiocchi</strong>
        {!compact && <small>Assinaturas</small>}
      </span>
    </Link>
  );
}
