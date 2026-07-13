import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={`brand${compact ? " brand--compact" : ""}`}
      href="/"
      aria-label="Maiocchi. Assinatura - início"
      title="Maiocchi. Assinatura"
    >
      <span className="brand__mark" aria-hidden="true">
        <span>m</span><i>.</i>
      </span>
    </Link>
  );
}
