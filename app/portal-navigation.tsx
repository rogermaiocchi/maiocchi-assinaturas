import Link from "next/link";
import {
  BadgeCheck,
  BookOpenText,
  CircleHelp,
  FileKey,
  FileSignature,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type PortalRoute = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

export const portalRoutes: PortalRoute[] = [
  { href: "/assinaturas-eletronicas/", label: "Modalidades de assinatura", shortLabel: "Modalidades", icon: FileSignature },
  { href: "/assinatura-gov-br/", label: "Assinatura GOV.BR", shortLabel: "GOV.BR", icon: Landmark },
  { href: "/certificacao-digital/", label: "Certificação digital", shortLabel: "Certificação", icon: FileKey },
  { href: "/validar/", label: "Validar assinatura", shortLabel: "Validar", icon: BadgeCheck },
  { href: "/seguranca/", label: "Segurança do portal", shortLabel: "Segurança", icon: ShieldCheck },
  { href: "/ajuda/", label: "Central de ajuda", shortLabel: "Ajuda", icon: CircleHelp },
];

const nextRoutes: Record<string, string[]> = {
  "/assinaturas-eletronicas/": ["/certificacao-digital/", "/assinatura-gov-br/", "/validar/"],
  "/assinatura-gov-br/": ["/validar/", "/certificacao-digital/", "/ajuda/"],
  "/certificacao-digital/": ["/assinaturas-eletronicas/", "/validar/", "/seguranca/"],
  "/validar/": ["/assinaturas-eletronicas/", "/assinatura-gov-br/", "/ajuda/"],
  "/seguranca/": ["/privacidade/", "/validar/", "/ajuda/"],
  "/ajuda/": ["/assinaturas-eletronicas/", "/validar/", "/seguranca/"],
  "/privacidade/": ["/seguranca/", "/termos/", "/ajuda/"],
  "/termos/": ["/privacidade/", "/assinaturas-eletronicas/", "/ajuda/"],
  "/codigo-fonte/": ["/seguranca/", "/privacidade/", "/ajuda/"],
};

const institutionalRoutes: PortalRoute[] = [
  { href: "/privacidade/", label: "Política de privacidade", shortLabel: "Privacidade", icon: LockKeyhole },
  { href: "/termos/", label: "Termos de uso", shortLabel: "Termos", icon: BookOpenText },
];

function findRoute(href: string) {
  return [...portalRoutes, ...institutionalRoutes].find((route) => route.href === href);
}

export function PortalSectionNav({ currentPath }: { currentPath: string }) {
  return (
    <nav className="portal-sections" aria-label="Seções do portal">
      <div className="shell portal-sections__track">
        {portalRoutes.map((route) => {
          const Icon = route.icon;
          const active = currentPath === route.href;
          return (
            <Link className={active ? "is-active" : ""} href={route.href} aria-current={active ? "page" : undefined} key={route.href}>
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{route.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function NextActions({ currentPath }: { currentPath: string }) {
  const routes = (nextRoutes[currentPath] || ["/assinaturas-eletronicas/", "/validar/", "/ajuda/"])
    .map(findRoute)
    .filter((route): route is PortalRoute => Boolean(route));

  return (
    <aside className="next-actions" aria-labelledby="next-actions-title">
      <div>
        <p className="eyebrow">Continue no portal</p>
        <h2 id="next-actions-title">Encontre o próximo passo.</h2>
      </div>
      <nav aria-label="Próximas páginas recomendadas">
        {routes.map((route) => {
          const Icon = route.icon;
          return (
            <Link href={route.href} key={route.href}>
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span>{route.label}</span>
              <span aria-hidden="true">→</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
