import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={`brand${compact ? " brand--compact" : ""}`}
      href="/"
      aria-label="Maiocchi — início"
      title="Ir para o início"
    >
      <span className="brand__mark" aria-hidden="true">
        <Image className="brand__mark-image brand__mark-image--dark" src="/maiocchi-mark.svg" alt="" width={512} height={512} />
        <Image className="brand__mark-image brand__mark-image--light" src="/maiocchi-mark-light.svg" alt="" width={512} height={512} />
      </span>
    </Link>
  );
}
