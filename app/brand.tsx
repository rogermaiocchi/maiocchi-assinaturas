import Link from "next/link";
import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand${compact ? " brand--compact" : ""}`} href="/">
      <Image className="brand__mark" src="/icon-512.png" alt="" width={512} height={512} priority />
      <span className="brand__name">
        <strong>Maiocchi</strong>
        {!compact && <small>Assinaturas</small>}
      </span>
    </Link>
  );
}
