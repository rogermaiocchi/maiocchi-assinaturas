import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  FolderKanban,
  Home,
  PenLine,
} from "lucide-react";

export function PortalSectionNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="portal-sections" aria-label="Acessos diretos do portal">
      <div className="shell portal-sections__track">
        <Link href="/#acessar-documento"><PenLine aria-hidden="true" size={18} /><span>Abrir documento</span></Link>
        <Link className={currentPath === "/validar/" ? "is-active" : ""} href="/#validar" aria-current={currentPath === "/validar/" ? "page" : undefined}><BadgeCheck aria-hidden="true" size={18} /><span>Validar</span></Link>
        <Link href="/#advogados"><FolderKanban aria-hidden="true" size={18} /><span>Área dos advogados</span></Link>
      </div>
    </nav>
  );
}

export function NextActions({ currentPath }: { currentPath: string }) {
  const actions = [
    { href: "/", label: "Voltar ao início", icon: Home },
    ...(currentPath === "/validar/" ? [] : [{ href: "/#validar", label: "Validar documento", icon: BadgeCheck }]),
    { href: "/#advogados", label: "Área dos advogados", icon: FolderKanban },
  ];

  return (
    <aside className="next-actions" aria-labelledby="next-actions-title">
      <div>
        <p className="eyebrow">Acesso direto</p>
        <h2 id="next-actions-title">Siga sem percorrer outras páginas.</h2>
      </div>
      <nav aria-label="Ações diretas recomendadas">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link href={href} key={href}><Icon aria-hidden="true" size={20} strokeWidth={1.8} /><span>{label}</span><ArrowRight aria-hidden="true" size={16} /></Link>
        ))}
      </nav>
    </aside>
  );
}
