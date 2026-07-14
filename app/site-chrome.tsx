"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  BookOpenText,
  CircleHelp,
  FileKey,
  FileSignature,
  FolderLock,
  HelpCircle,
  Home,
  Info,
  Landmark,
  LockKeyhole,
  LogIn,
  Menu,
  PenLine,
  Scale,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "./brand";

const mainNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/#acessar-documento", label: "Assinar", icon: PenLine },
  { href: "/#validar", label: "Validar", icon: BadgeCheck },
  { href: "/#advogados", label: "Advogados", icon: FolderLock },
];

const mobileNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  ...mainNav,
  { href: "/#modalidades", label: "Modalidades", icon: FileSignature },
  { href: "/ajuda/", label: "Central de ajuda", icon: CircleHelp },
];

const footerGroups: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
  links: Array<{ href: string; label: string; icon: LucideIcon }>;
}> = [
  {
    title: "Informações",
    description: "Funcionamento, proteção e suporte.",
    icon: Info,
    links: [
      { href: "/#como-funciona", label: "Como funciona", icon: FileSignature },
      { href: "/seguranca/", label: "Segurança", icon: ShieldCheck },
      { href: "/ajuda/", label: "Central de ajuda", icon: HelpCircle },
    ],
  },
  {
    title: "Modalidades",
    description: "Caminho adequado para cada assinatura.",
    icon: FileKey,
    links: [
      { href: "/assinaturas-eletronicas/", label: "Assinaturas eletrônicas", icon: FileSignature },
      { href: "/certificado-icp-brasil/", label: "Certificado ICP-Brasil", icon: FileKey },
      { href: "/assinatura-gov-br/", label: "Assinatura GOV.BR", icon: Landmark },
      { href: "/#validar-iti", label: "VALIDAR ITI", icon: BadgeCheck },
    ],
  },
  {
    title: "Políticas",
    description: "Regras, privacidade e responsabilidade.",
    icon: Scale,
    links: [
      { href: "/privacidade/", label: "Política de privacidade", icon: LockKeyhole },
      { href: "/termos/", label: "Termos de uso", icon: BookOpenText },
      { href: "/seguranca/", label: "Proteção de dados", icon: ShieldCheck },
    ],
  },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 28);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      requestAnimationFrame(() => menuButton.current?.focus());
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function isCurrent(href: string) {
    if (href.startsWith("/#")) return false;
    return pathname === href;
  }

  return (
    <>
      <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="shell header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Navegação principal">
            {mainNav.map(({ href, label, icon: Icon }) => (
              <Link
                className="icon-nav-link"
                href={href}
                key={href}
                aria-label={label}
                title={label}
                data-tooltip={label}
                aria-current={isCurrent(href) ? "page" : undefined}
              >
                <Icon aria-hidden="true" size={19} strokeWidth={1.9} />
                <span className="sr-only">{label}</span>
              </Link>
            ))}
          </nav>
          <Link className="header-icon-action mobile-access" href="/#advogados" aria-label="Entrar como advogado" title="Entrar como advogado">
            <LogIn aria-hidden="true" size={17} />
            <span className="sr-only">Entrar como advogado</span>
          </Link>
          <div className="mobile-nav">
            <button
              ref={menuButton}
              className="header-icon-action mobile-menu-toggle"
              type="button"
              aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              title={menuOpen ? "Fechar navegação" : "Abrir navegação"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" size={21} /> : <Menu aria-hidden="true" size={21} />}
            </button>
            {menuOpen && (
              <nav id="mobile-navigation" aria-label="Navegação móvel">
                <Link href="/" onClick={() => setMenuOpen(false)}><Home aria-hidden="true" size={17} /><span>Início</span></Link>
                {mobileNav.map(({ href, label, icon: Icon }) => (
                  <Link href={href} key={href} aria-current={isCurrent(href) ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                    <Icon aria-hidden="true" size={17} />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="shell footer-main">
        <div className="footer-summary">
          <strong>Assinatura com percurso claro.</strong>
          <p>Documentos, assinaturas e validação em um único endereço.</p>
        </div>
        <nav className="footer-primary" aria-label="Acessos principais">
          <Link href="/#acessar-documento"><PenLine aria-hidden="true" size={16} /><span>Assinar documento</span></Link>
          <Link href="/#validar"><BadgeCheck aria-hidden="true" size={16} /><span>Validar autenticidade</span></Link>
          <Link href="/#advogados"><LogIn aria-hidden="true" size={16} /><span>Entrar como advogado</span></Link>
        </nav>
      </div>
      <details className="shell footer-disclosure">
        <summary>
          <span><strong>Informações, modalidades e políticas</strong><small>Consulte o conteúdo institucional sem sair do fluxo principal.</small></span>
        </summary>
        <div className="footer-groups">
          {footerGroups.map(({ title, description, icon: GroupIcon, links }) => (
            <section className="footer-group" key={title} aria-labelledby={`footer-${title.toLowerCase()}`}>
              <div className="footer-group__heading">
                <GroupIcon aria-hidden="true" size={19} />
                <div><h2 id={`footer-${title.toLowerCase()}`}>{title}</h2><p>{description}</p></div>
              </div>
              <nav aria-label={title}>
                {links.map(({ href, label, icon: Icon }) => (
                  <Link href={href} key={`${title}-${href}`}><Icon aria-hidden="true" size={15} /><span>{label}</span></Link>
                ))}
              </nav>
            </section>
          ))}
        </div>
      </details>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Maiocchi Advogado</span>
        <span>Responsável: Roger Maiocchi, OAB/DF 31.249.</span>
      </div>
    </footer>
  );
}
