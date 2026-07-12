import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FolderKanban,
  Home,
  PenLine,
} from "lucide-react";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://assinatura.maiocchi.adv.br";
const lawyersBase = process.env.NEXT_PUBLIC_LAWYERS_URL || `${documentsBase}/dashboard`;

export function PortalSectionNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="portal-sections" aria-label="Acessos diretos do portal">
      <div className="shell portal-sections__track">
        <Link href="/#acessar-documento"><PenLine aria-hidden="true" size={18} /><span>Abrir documento</span></Link>
        <Link className={currentPath === "/validar/" ? "is-active" : ""} href="/validar/" aria-current={currentPath === "/validar/" ? "page" : undefined}><BadgeCheck aria-hidden="true" size={18} /><span>Validar</span></Link>
        <a href={lawyersBase}><FolderKanban aria-hidden="true" size={18} /><span>Área dos advogados</span></a>
      </div>
    </nav>
  );
}

export function NextActions({ currentPath }: { currentPath: string }) {
  const actions = [
    { href: "/", label: "Voltar ao início", icon: Home },
    ...(currentPath === "/validar/" ? [] : [{ href: "/validar/", label: "Validar documento", icon: BadgeCheck }]),
    { href: lawyersBase, label: "Área dos advogados", icon: FolderKanban, external: true },
  ];

  return (
    <aside className="next-actions" aria-labelledby="next-actions-title">
      <div>
        <p className="eyebrow">Acesso direto</p>
        <h2 id="next-actions-title">Siga sem percorrer outras páginas.</h2>
      </div>
      <nav aria-label="Ações diretas recomendadas">
        {actions.map(({ href, label, icon: Icon, external }) => external ? (
          <a href={href} key={href}><Icon aria-hidden="true" size={20} strokeWidth={1.8} /><span>{label}</span><ArrowRight aria-hidden="true" size={16} /></a>
        ) : (
          <Link href={href} key={href}><Icon aria-hidden="true" size={20} strokeWidth={1.8} /><span>{label}</span><ArrowRight aria-hidden="true" size={16} /></Link>
        ))}
      </nav>
    </aside>
  );
}
