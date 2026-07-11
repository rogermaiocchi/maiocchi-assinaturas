"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  BookOpenText,
  CircleHelp,
  Code2,
  FileKey,
  FileSignature,
  Home,
  Landmark,
  LockKeyhole,
  LogIn,
  Mail,
  Menu,
  PenLine,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "./brand";

const documentsBase = process.env.NEXT_PUBLIC_DOCUMENTS_URL || "https://documentos.assinatura.maiocchi.adv.br";
const lawyersBase = process.env.NEXT_PUBLIC_LAWYERS_URL || `${documentsBase}/sign_in`;

const mainNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/#acessar-documento", label: "Assinar", icon: PenLine },
  { href: "/assinaturas-eletronicas/", label: "Modalidades", icon: FileSignature },
  { href: "/validar/", label: "Validar", icon: BadgeCheck },
  { href: "/ajuda/", label: "Ajuda", icon: CircleHelp },
];

const mobileNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  ...mainNav,
  { href: "/certificado-icp-brasil/", label: "Certificado ICP-Brasil", icon: FileKey },
  { href: "/assinatura-gov-br/", label: "Assinatura GOV.BR", icon: Landmark },
  { href: "/seguranca/", label: "Segurança", icon: ShieldCheck },
];

const footerNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/assinaturas-eletronicas/", label: "Modalidades", icon: FileSignature },
  { href: "/certificado-icp-brasil/", label: "ICP-Brasil", icon: FileKey },
  { href: "/assinatura-gov-br/", label: "GOV.BR", icon: Landmark },
  { href: "/validar/", label: "Validar", icon: BadgeCheck },
  { href: "/seguranca/", label: "Segurança", icon: ShieldCheck },
  { href: "/privacidade/", label: "Privacidade", icon: LockKeyhole },
  { href: "/termos/", label: "Termos", icon: BookOpenText },
  { href: "/codigo-fonte/", label: "Código-fonte", icon: Code2 },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

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
    if (href.startsWith("/#")) return pathname === "/";
    return pathname === href;
  }

  return (
    <>
      <a className="skip-link" href="#conteudo-principal">Ir para o conteúdo principal</a>
      <header className="site-header">
        <div className="shell header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Navegação principal">
            {mainNav.map(({ href, label, icon: Icon }) => {
              const current = isCurrent(href);
              return (
                <Link href={href} key={href} aria-current={current ? "page" : undefined}>
                  <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <a className="button button--dark button--small header-login" href={lawyersBase} title="Área dos advogados">
            <LogIn aria-hidden="true" size={16} />
            <span>Área dos advogados</span>
          </a>
          <Link className="button button--yellow mobile-access" href="/#acessar-documento">
            <FileSignature aria-hidden="true" size={17} />
            <span>Acessar</span>
          </Link>
          <div className="mobile-nav">
            <button
              ref={menuButton}
              className="mobile-menu-toggle"
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
                <a href={lawyersBase}><LogIn aria-hidden="true" size={17} /><span>Área dos advogados</span></a>
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
        <Brand compact />
        <p>Portal de documentos e assinaturas do Maiocchi Advogado. Responsável: Roger Maiocchi, OAB/DF 31.249.</p>
        <nav className="footer-links" aria-label="Navegação institucional">
          {footerNav.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon aria-hidden="true" size={15} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Maiocchi Advogado</span>
        <a href="mailto:roger@maiocchi.adv.br"><Mail aria-hidden="true" size={13} /><span>roger@maiocchi.adv.br</span></a>
      </div>
    </footer>
  );
}
