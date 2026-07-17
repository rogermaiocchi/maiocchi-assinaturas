"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CircleHelp,
  FileKey,
  FileSignature,
  Fingerprint,
  FolderLock,
  Info,
  Landmark,
  LockKeyhole,
  Menu,
  PenLine,
  Scale,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "./brand";

type NavigationItem = { href: string; label: string; description: string; icon: LucideIcon };

const navigationGroups: Array<{ title: string; items: NavigationItem[] }> = [
  {
    title: "Operações",
    items: [
      { href: "/#acessar-documento", label: "Abrir documento", description: "Use o link ou código recebido.", icon: PenLine },
      { href: "/#validar", label: "Validar", description: "Consulte a chave e compare o PDF.", icon: BadgeCheck },
      { href: "/#advogados", label: "Acesso profissional", description: "Entre por certificado ou senha.", icon: FolderLock },
    ],
  },
  {
    title: "Assinaturas",
    items: [
      { href: "/assinaturas-eletronicas/", label: "Modalidades", description: "Simples, avançada e qualificada.", icon: FileSignature },
      { href: "/certificado-icp-brasil/", label: "ICP-Brasil", description: "Certificado digital e PAdES.", icon: Fingerprint },
      { href: "/assinatura-gov-br/", label: "GOV.BR", description: "Percurso oficial de assinatura.", icon: Landmark },
    ],
  },
  {
    title: "Confiança",
    items: [
      { href: "/seguranca/", label: "Segurança", description: "Proteção, isolamento e evidências.", icon: ShieldCheck },
      { href: "/certificacao-digital/", label: "Certificação digital", description: "Identidade, chaves e certificados.", icon: FileKey },
      { href: "/ajuda/", label: "Central de ajuda", description: "Orientação para concluir o fluxo.", icon: CircleHelp },
    ],
  },
  {
    title: "Institucional",
    items: [
      { href: "/privacidade/", label: "Privacidade", description: "Tratamento e proteção de dados.", icon: LockKeyhole },
      { href: "/termos/", label: "Termos de serviço", description: "Condições e responsabilidades.", icon: Scale },
    ],
  },
];

export function SiteHeader({ heroTone = "dark" }: { heroTone?: "dark" | "light" } = {}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuLayer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const inertTargets = Array.from(document.querySelectorAll<HTMLElement>(
      ".skip-link, .site-header .brand, #conteudo-principal, .site-footer",
    ));
    const previousInert = inertTargets.map((target) => target.inert);
    document.body.style.overflow = "hidden";
    inertTargets.forEach((target) => { target.inert = true; });

    const focusFrame = window.requestAnimationFrame(() => {
      menuLayer.current?.querySelector<HTMLElement>("a[href]")?.focus();
    });

    function manageMenuKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        requestAnimationFrame(() => menuButton.current?.focus());
        return;
      }

      if (event.key !== "Tab") return;
      const menuItems = Array.from(
        menuLayer.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
      );
      const first = menuButton.current;
      const last = menuItems.at(-1) ?? first;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !menuItems.includes(active as HTMLElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", manageMenuKeyboard);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      inertTargets.forEach((target, index) => { target.inert = previousInert[index]; });
      document.removeEventListener("keydown", manageMenuKeyboard);
    };
  }, [menuOpen]);

  function isCurrent(href: string) {
    if (href.startsWith("/#")) return false;
    return pathname === href;
  }

  return (
    <>
      <a className="skip-link" href="#conteudo-principal">Ir para o conteúdo principal</a>
      <header className={`site-header${heroTone === "light" && !scrolled && !menuOpen ? " site-header--on-light" : ""}${scrolled || menuOpen ? " is-scrolled" : ""}${menuOpen ? " is-menu-open" : ""}`}>
        <div className="shell header-inner">
          <Brand />
          <button
            ref={menuButton}
            className="header-icon-action site-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"}
            aria-expanded={menuOpen}
            aria-controls="global-navigation"
            title={menuOpen ? "Fechar navegação" : "Abrir navegação"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div ref={menuLayer} className="site-menu-layer" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            setMenuOpen(false);
            requestAnimationFrame(() => menuButton.current?.focus());
          }
        }}>
          <nav id="global-navigation" className="site-menu" aria-label="Navegação principal">
            <div className="shell site-menu__inner">
              <div className="site-menu__heading">
                <p className="eyebrow"><Info aria-hidden="true" size={14} /> Navegação do portal</p>
                <h2>Escolha o destino.</h2>
                <p>Documentos, assinaturas, segurança e políticas.</p>
              </div>
              <div className="site-menu__groups">
                {navigationGroups.map((group) => (
                  <section className="site-menu__group" key={group.title} aria-labelledby={`menu-${group.title.toLowerCase()}`}>
                    <h3 id={`menu-${group.title.toLowerCase()}`}>{group.title}</h3>
                    {group.items.map(({ href, label, description, icon: Icon }) => (
                      <Link
                        href={href}
                        key={href}
                        aria-current={isCurrent(href) ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                      >
                        <span className="site-menu__icon"><Icon aria-hidden="true" size={19} strokeWidth={1.8} /></span>
                        <span><strong>{label}</strong><small>{description}</small></span>
                      </Link>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-bottom footer-bottom--minimal">
        <Brand />
        <nav className="site-footer__policy-links" aria-label="Políticas do portal">
          <Link href="/termos/">Termos de serviço</Link>
          <Link href="/privacidade/">Política de privacidade</Link>
        </nav>
      </div>
    </footer>
  );
}
