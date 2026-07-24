import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

test("renderiza a porta de entrada Maiocchi", async () => {
  const [html, mark, lightMark] = await Promise.all([
    readFile(new URL("index.html", outputRoot), "utf8"),
    readFile(new URL("../public/maiocchi-mark.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/maiocchi-mark-light.svg", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<title>Documentos e assinaturas \| Maiocchi Advogado<\/title>/i);
  assert.match(html, /Recebeu um documento\?/i);
  assert.match(html, /Serviço de apoio ao cliente/i);
  assert.match(html, /<h1 class="hero-title">Assinatura digital<\/h1>/i);
  assert.match(html, /class="breadcrumb hero-breadcrumb" aria-label="Caminho da página"/i);
  assert.match(html, /aria-current="page">Início</i);
  assert.doesNotMatch(html, /class="trust-row"/i);
  assert.match(html, /<p class="eyebrow">Validação integrada<\/p>/i);
  assert.match(html, /<p class="eyebrow">Chave de autenticidade<\/p>/i);
  assert.doesNotMatch(html, /Consulte a chave Maiocchi|<small>Serviço oficial externo<\/small>/i);
  assert.doesNotMatch(html, /Maiocchi<span>\.<\/span> <strong>Assinatura<\/strong>/i);
  assert.equal((html.match(/site-menu-toggle/g) || []).length, 1);
  assert.doesNotMatch(html, /class="icon-nav-link"|class="operation-rail"|class="portal-sections"|class="next-actions"/i);
  assert.match(html, /class="brand__mark"/i);
  assert.match(html, /aria-label="Maiocchi — início"/i);
  assert.doesNotMatch(html, /Maiocchi\. Assinatura/i);
  assert.match(html, /<img[^>]*class="brand__mark-image brand__mark-image--dark"[^>]*src="\/maiocchi-mark\.svg"/i);
  assert.match(html, /<img[^>]*class="brand__mark-image brand__mark-image--light"[^>]*src="\/maiocchi-mark-light\.svg"/i);
  assert.doesNotMatch(html, /class="brand__name"/i);
  assert.match(mark, /viewBox="0 0 512 512"/i);
  assert.match(mark, /<text x="38" y="405"[^>]*>m<\/text>/i);
  assert.match(mark, /<circle cx="410" cy="371" r="36" fill="#ffb800"\/>/i);
  assert.match(lightMark, /<text x="38" y="405" fill="#ffffff"[^>]*>m<\/text>/i);
  assert.match(html, /Ir para o conteúdo principal/i);
  assert.match(html, /id="conteudo-principal"/i);
  assert.match(html, /href="\/ajuda\/"[^>]*>[\s\S]*Acessar central de ajuda/i);
  assert.doesNotMatch(html, /<div class="footer-summary">\s*<strong>Maiocchi\. Assinatura<\/strong>/i);
  assert.match(html, /Acesso restrito/i);
  assert.match(html, /Gestão de documentos/i);
  assert.match(html, /Para assinar, use o link ou código no início desta página/i);
  assert.doesNotMatch(html, /Sessão protegida na mesma origem|Certificado digital disponível|Segundo fator quando habilitado/i);
  assert.doesNotMatch(html, /Documentos e evidências em um endereço/i);
  assert.ok(html.indexOf('id="validar"') < html.indexOf('id="advogados"'), "a validação deve anteceder a gestão interna");
  assert.ok(html.indexOf('id="modalidades"') < html.indexOf('id="advogados"'), "a jornada do cliente deve anteceder a gestão interna");
  assert.match(html, /Entrar com certificado/i);
  assert.doesNotMatch(html, /Entrar com Portal Maiocchi/i);
  assert.doesNotMatch(html, /href="[^"]*\/dashboard/i);
  assert.doesNotMatch(html, /href="[^"]*\/sign_in/i);
  assert.doesNotMatch(html, /documentos\.assinatura\.maiocchi\.adv\.br/i);
  assert.match(html, /ICP-BRASIL/i);
  assert.match(html, /\/certificado-icp-brasil\//i);
  assert.doesNotMatch(html, /roger@maiocchi\.adv\.br/i);
  assert.match(html, /src="https:\/\/validar\.iti\.gov\.br\/"/i);
  assert.doesNotMatch(html, /Responsável: Roger Maiocchi|©\s*\d{4}\s*Maiocchi Advogado/i);
  assert.match(html, /Termos de serviço/i);
  assert.match(html, /Política de privacidade/i);
  assert.match(html, /\/assinaturas-eletronicas\//i);
  assert.match(html, /\/assinatura-gov-br\//i);
  assert.doesNotMatch(html, /admin@maiocchi\.adv\.br|contato@maiocchi\.adv\.br|Maiocchi Advocacia/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publica licença e fonte DocuSeal aprovadas no artefato estático", async () => {
  const [licenseSource, licenseBuild, docusealSource, docusealBuild] = await Promise.all([
    readFile(new URL("../public/legal/LICENSE.txt", import.meta.url)),
    readFile(new URL("legal/LICENSE.txt", outputRoot)),
    readFile(new URL("../public/legal/source/docuseal-maiocchi-3.0.1-maiocchi.15.tar.gz", import.meta.url)),
    readFile(new URL("legal/source/docuseal-maiocchi-3.0.1-maiocchi.15.tar.gz", outputRoot)),
  ]);

  assert.deepEqual(licenseBuild, licenseSource);
  assert.deepEqual(docusealBuild, docusealSource);
  assert.equal(createHash("sha256").update(licenseSource).digest("hex"), "76a97c878c9c7a8321bb395c2b44d3fe2f8d81314d219b20138ed0e2dddd5182");
  assert.equal(createHash("sha256").update(docusealSource).digest("hex"), "ccbddf305d162263b580d8aafbb4fd014b961bd4b6e8b2e0ce9f48d4ee31191c");
});

test("incorpora autenticação e reconduz páginas intermediárias à home", async () => {
  const [accessSource, dashboardPatch, traefik, nginx] = await Promise.all([
    readFile(new URL("../app/lawyer-access.tsx", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0001-single-entry-home.patch", import.meta.url), "utf8"),
    readFile(new URL("../deploy/traefik-assinatura.yml", import.meta.url), "utf8"),
    readFile(new URL("../nginx.conf", import.meta.url), "utf8"),
  ]);

  assert.match(accessSource, /fetch\("\/portal-auth\/session"/i);
  assert.match(accessSource, /authenticity_token/i);
  assert.match(accessSource, /\/portal-auth\/certificate/i);
  assert.match(accessSource, /fetch\("\/portal-auth\/certificate"/i);
  assert.match(accessSource, /form\[action='\/certificate_auth\/login\/start'\]/i);
  assert.match(accessSource, /credentials: "same-origin"/i);
  assert.match(accessSource, /certificateRelayOrigin = "https:\/\/certificado\.assinatura\.maiocchi\.adv\.br"/i);
  assert.match(accessSource, /relayAction\.origin !== certificateRelayOrigin/i);
  assert.match(accessSource, /relayAction\.pathname !== certificateRelayPath/i);
  assert.match(accessSource, /function isAuthenticatedRedirect\(response: Response\)/i);
  assert.match(accessSource, /destination\.origin === window\.location\.origin/i);
  assert.match(accessSource, /destination\.pathname === "\/" \|\| destination\.pathname === "\/dashboard"/i);
  assert.match(accessSource, /if \(isAuthenticatedRedirect\(response\)\) return \{ kind: "authenticated" \}/i);
  assert.match(accessSource, /if \(session\.kind === "authenticated"\)[\s\S]*enterProfessionalEnvironment\(\)/i);
  assert.match(accessSource, /window\.location\.replace\("\/dashboard"\)/i);
  assert.doesNotMatch(accessSource, /Abrir ambiente de gestão|Acessar ambiente seguro/i);
  assert.doesNotMatch(accessSource, /response\.ok && destination === "\/" \|\| destination === "\/dashboard"/i);
  assert.match(accessSource, /role="tablist"/i);
  assert.match(accessSource, /aria-selected=\{accessMethod === "certificate"\}/i);
  assert.match(accessSource, /aria-orientation="horizontal"[\s\S]*onKeyDown=\{handleTabKeyDown\}/i);
  assert.match(accessSource, /ArrowRight[\s\S]*ArrowLeft[\s\S]*Home[\s\S]*End/i);
  assert.match(accessSource, /tabIndex=\{accessMethod === "certificate" \? 0 : -1\}/i);
  assert.match(dashboardPatch, /redirect_to.*#advogados/i);
  assert.match(traefik, /replacePath:[\s\S]*path: \/sign_in/i);
  assert.match(traefik, /sign-in-to-home/i);
  assert.match(
    traefik,
    /maiocchi-icp-client-auth:[\s\S]*minVersion: VersionTLS12[\s\S]*maxVersion: VersionTLS12[\s\S]*TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256[\s\S]*TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384[\s\S]*clientAuthType: RequireAndVerifyClientCert/i,
  );
  assert.match(nginx, /location = \/validar[\s\S]*try_files \/validar\/index[.]html =404;/i);
  assert.match(nginx, /location = \/validar\/[\s\S]*try_files \/validar\/index[.]html =404;/i);
  assert.match(nginx, /form-action 'self' https:\/\/certificado\.assinatura\.maiocchi\.adv\.br/i);
  assert.doesNotMatch(nginx, /return 302 \/\$is_args\$args#validar;/i);
});

test("aplica o sistema visual translúcido com imagens responsivas em alta resolução", async () => {
  const [layout, theme, home, ...assets] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/glass-system.css", import.meta.url), "utf8"),
    readFile(new URL("index.html", outputRoot), "utf8"),
    ...[
      "hero-home-maiocchi.webp",
      "hero-assinaturas.webp",
      "hero-validation-glass.webp",
      "hero-evidence-gold.webp",
      "hero-security-architecture-4k.webp",
      "hero-courthouse-4k.webp",
      "hero-govbr-glass.webp",
      "hero-certification-pillars.webp",
      "hero-privacy-abstract.webp",
      "hero-security-financial.webp",
      "hero-terms-legal.webp",
    ].map((asset) => stat(new URL(`../public/${asset}`, import.meta.url))),
  ]);

  assert.match(layout, /import "[.]\/glass-system[.]css"/i);
  assert.match(theme, /--glass-blur: blur\(26px\) saturate\(122%\)/i);
  assert.match(home, /src="\/hero-assinaturas[.]webp"/i);
  assert.match(theme, /hero--institutional[\s\S]*min-height: clamp\(680px, 88svh, 900px\)/i);
  assert.match(theme, /hero--institutional[\s\S]*min-height: clamp\(680px, 88dvh, 900px\)/i);
  assert.match(theme, /hero--institutional::after[\s\S]*var\(--hero-floor\) 100%/i);
  assert.match(theme, /hero--institutional \.hero__content[\s\S]*min-height: inherit[\s\S]*align-items: flex-end/i);
  assert.match(theme, /hero--institutional \.hero__image[\s\S]*object-fit: cover/i);
  assert.doesNotMatch(home, /id="advogados"[\s\S]{0,400}src="\/hero-assinaturas[.]webp"/i);
  assert.match(home, /src="\/hero-validation-glass[.]webp"/i);
  assert.match(home, /src="\/hero-evidence-gold[.]webp"/i);
  assert.match(home, /src="\/hero-courthouse-4k[.]webp"/i);
  assert.match(theme, /portal-band::before,[\s\S]*height: 190px/i);
  assert.match(theme, /page-hero::after[\s\S]*height: 260px/i);
  assert.match(theme, /page-hero[\s\S]*min-height: clamp\(680px, 88dvh, 900px\)/i);
  assert.match(theme, /page-hero--dark \.page-hero__shade[\s\S]*linear-gradient\(to bottom, rgba\(8, 9, 8, 0\.58\)/i);
  assert.match(theme, /hero--institutional \.eyebrow,[\s\S]*\.page-hero \.eyebrow[\s\S]*color: var\(--yellow\); font-weight: 400/i);
  assert.doesNotMatch(theme, /signing-masthead/i);
  assert.match(theme, /site-header\.site-header--on-light/i);
  assert.match(theme, /@media \(min-width: 1400px\)[\s\S]*--max: 2080px/i);
  assert.match(theme, /portal-band--verification \.portal-band__content[\s\S]*grid-template-columns: minmax\(320px, 0\.62fr\) minmax\(760px, 1\.38fr\)/i);
  assert.match(theme, /legal-content[\s\S]*1480px[\s\S]*legal-body > p[\s\S]*max-width: 940px/i);
  assert.match(theme, /@media \(max-width: 780px\)/i);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/i);
  assert.match(home, /Método de acesso/i);
  assert.match(home, /Certificado/i);
  assert.match(home, /Senha/i);
  for (const asset of assets) assert.ok(asset.size > 90_000, "cada imagem editorial deve ser um WebP real de alta resolução");
});

test("aplica um único contrato de hero e caminho a todas as páginas internas", async () => {
  const routes = [
    ["ajuda/index.html", "Central de ajuda", "hero-support-maiocchi.jpg"],
    ["assinar-icp/index.html", "Assinar com ICP-Brasil", "hero-security-architecture-4k.webp"],
    ["assinatura-gov-br/index.html", "Assinatura GOV.BR", "hero-govbr-glass.webp"],
    ["assinaturas-eletronicas/index.html", "Assinaturas eletrônicas", "hero-evidence-gold.webp"],
    ["certificacao-digital/index.html", "Certificação digital", "hero-certification-pillars.webp"],
    ["certificado-icp-brasil/index.html", "Certificado ICP-Brasil", "hero-courthouse-4k.webp"],
    ["privacidade/index.html", "Política de privacidade", "hero-privacy-abstract.webp"],
    ["seguranca/index.html", "Segurança", "hero-security-financial.webp"],
    ["termos/index.html", "Termos de serviço", "hero-terms-legal.webp"],
    ["validar/index.html", "Validar assinatura", "hero-validation-glass.webp"],
    ["404.html", "Esta página não está disponível", "hero-security-architecture-4k.webp"],
  ];

  const routeHeroImages = new Set();
  for (const [file, title, image] of routes) {
    const html = await readFile(new URL(file, outputRoot), "utf8");
    const hero = html.match(/<section class="page-hero page-hero--dark[^\"]*"[\s\S]*?<\/section>/i)?.[0];
    assert.ok(hero, `${file} deve usar o PageHero compartilhado`);
    assert.match(hero, /class="page-hero__media"[\s\S]*aria-hidden="true"/i);
    assert.match(hero, /class="page-hero__shade"/i);
    assert.match(hero, /class="shell page-hero__content"/i);
    assert.match(hero, /aria-label="Caminho da página"/i);
    assert.match(hero, /href="\/"[\s\S]*>Portal</i);
    assert.match(hero, /aria-current="page"/i);
    assert.match(hero, /<p class="eyebrow">[^<]+<\/p>/i);
    assert.doesNotMatch(hero, /status-dot|<p class="eyebrow">[\s\S]*?<svg/i);
    assert.match(hero, new RegExp(`<h1[^>]*>${title}`, "i"));
    assert.match(hero, /class="legal-lead"/i);
    assert.match(hero, new RegExp(`src="/${image.replace(/[.]/g, "[.]")}"`, "i"));
    if (file !== "404.html") routeHeroImages.add(image);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${file} deve ter um único h1`);
    assert.match(html, /maiocchi-mark-light\.svg/i);
    assert.match(html, /Termos de serviço/i);
    assert.match(html, /Política de privacidade/i);
  }
  assert.equal(routeHeroImages.size, 10, "cada página interna deve ter uma imagem de hero própria");
});

test("padroniza os links universais do rodapé com risco laranja", async () => {
  const theme = await readFile(new URL("../app/glass-system.css", import.meta.url), "utf8");
  assert.match(theme, /site-footer__policy-links a[\s\S]*text-decoration-color: var\(--yellow\)[\s\S]*text-decoration-thickness: 2px/i);
});

test("mantém estados de erro dentro do mesmo sistema visual", async () => {
  const [errorPage, globalError, errorState, pageHero] = await Promise.all([
    readFile(new URL("../app/error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/global-error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/portal-error-state.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page-hero.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(errorPage, /^"use client";/i);
  assert.match(globalError, /^"use client";/i);
  assert.match(globalError, /<html lang="pt-BR">[\s\S]*<body>/i);
  assert.match(errorState, /<SiteHeader \/>[\s\S]*<PageHero[\s\S]*page-hero--not-found[\s\S]*<SiteFooter \/>/i);
  assert.match(pageHero, /aria-label="Caminho da página"/i);
  assert.match(pageHero, /<p className="eyebrow">\{eyebrow\}<\/p>/i);
  assert.doesNotMatch(pageHero, /status-dot/);
});

test("publica páginas legais e de ajuda", async () => {
  const [privacy, terms, help] = await Promise.all([
    readFile(new URL("privacidade/index.html", outputRoot), "utf8"),
    readFile(new URL("termos/index.html", outputRoot), "utf8"),
    readFile(new URL("ajuda/index.html", outputRoot), "utf8"),
  ]);
  assert.match(privacy, /Política de privacidade/i);
  assert.match(privacy, /OAB\/DF 31\.249/i);
  assert.match(privacy, /Direitos do titular/i);
  assert.doesNotMatch(privacy, /Versão de 15 de julho de 2026/i);
  assert.match(privacy, /class="mermaid-diagram"/i);
  assert.doesNotMatch(privacy, /class="flow-map"/i);
  assert.match(terms, /Condições para acessar/i);
  assert.match(terms, /OAB\/DF/i);
  assert.match(help, /Assinatura com certificado ICP-Brasil/i);
  for (const html of [privacy, terms, help]) {
    assert.match(html, /roger@maiocchi\.adv\.br|Maiocchi Advogado/i);
    assert.doesNotMatch(html, /admin@maiocchi\.adv\.br|contato@maiocchi\.adv\.br|Maiocchi Advocacia/i);
  }
  assert.doesNotMatch(privacy, /roger@maiocchi\.adv\.br/i);
  assert.doesNotMatch(terms, /roger@maiocchi\.adv\.br/i);
  assert.match(help, /roger@maiocchi\.adv\.br/i);
});

test("publica e conecta o conteúdo de assinaturas e segurança", async () => {
  const [pages, verifierSource] = await Promise.all([Promise.all([
    readFile(new URL("assinaturas-eletronicas/index.html", outputRoot), "utf8"),
    readFile(new URL("certificacao-digital/index.html", outputRoot), "utf8"),
    readFile(new URL("certificado-icp-brasil/index.html", outputRoot), "utf8"),
    readFile(new URL("assinatura-gov-br/index.html", outputRoot), "utf8"),
    readFile(new URL("validar/index.html", outputRoot), "utf8"),
    readFile(new URL("seguranca/index.html", outputRoot), "utf8"),
  ]), readFile(new URL("../app/validar/authenticity-verifier.tsx", import.meta.url), "utf8")]);

  assert.match(pages[0], /simples/i);
  assert.match(pages[0], /avançada/i);
  assert.match(pages[0], /qualificada/i);
  assert.match(pages[1], /A1, A3 e nuvem/i);
  assert.match(pages[2], /Autorizar no PSC/i);
  assert.match(pages[2], /certificado em nuvem/i);
  assert.match(pages[2], /token USB.*ponte local/i);
  assert.match(pages[2], /lista de prestadores de serviço de confiança/i);
  assert.doesNotMatch(pages[2], /CryptoTokenKit no MacBook|Verificar agente e token/i);
  assert.doesNotMatch(pages[2], /src="https:\/\/cdn\.lacunasoftware\.com\/libs\/web-pki/i);
  assert.match(pages[3], /serviço oficial/i);
  assert.match(pages[3], /validar\.iti\.gov\.br/i);
  assert.match(pages[3], /Cadeia_GovBr-der\.p7b/i);
  assert.match(pages[3], /não deve ser adicionada às raízes mTLS/i);
  assert.match(pages[4], /Validador do ITI/i);
  assert.match(pages[4], /MAI-2026-XXXX-XXXX-XXXX-XXXX/i);
  assert.match(pages[4], /DOC-ICP-15\.03 v9\.1/i);
  assert.match(verifierSource, /Comparar um PDF neste dispositivo/i);
  assert.match(verifierSource, /O cálculo ocorre localmente/i);
  assert.match(verifierSource, /crypto\.subtle\.digest\("SHA-256"/i);
  assert.match(pages[5], /Conexão e isolamento/i);

  for (const html of pages) {
    assert.match(html, /Maiocchi Advogado/i);
    assert.match(html, /\/privacidade\//i);
    assert.match(html, /\/termos\//i);
    assert.doesNotMatch(html, /admin@maiocchi\.adv\.br|contato@maiocchi\.adv\.br|Maiocchi Advocacia/i);
  }
});

test("mantém uma navegação global e fluxos visuais em todo o portal", async () => {
  const routes = [
    "assinaturas-eletronicas",
    "certificado-icp-brasil",
    "assinatura-gov-br",
    "certificacao-digital",
    "validar",
    "seguranca",
    "ajuda",
    "privacidade",
    "termos",
  ];
  const pages = await Promise.all(routes.map((route) => readFile(new URL(`${route}/index.html`, outputRoot), "utf8")));
  const [home, chromeSource] = await Promise.all([
    readFile(new URL("index.html", outputRoot), "utf8"),
    readFile(new URL("../app/site-chrome.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(home, /class="flow-map"/i);
  assert.match(chromeSource, /id="global-navigation"/i);
  assert.match(chromeSource, /Operações|Assinaturas|Confiança|Institucional/i);
  assert.match(chromeSource, /\.skip-link, \.site-header \.brand, #conteudo-principal, \.site-footer/i);
  assert.match(chromeSource, /target\.inert = true/i);
  assert.match(chromeSource, /event\.key !== "Tab"[\s\S]*event\.preventDefault\(\)/i);
  assert.doesNotMatch(chromeSource, /PortalSectionNav|NextActions|icon-nav-link/i);
  for (const [index, html] of pages.entries()) {
    if (routes[index] === "privacidade") assert.match(html, /class="mermaid-diagram"/i);
    else assert.match(html, /class="flow-map"/i);
    assert.match(html, /aria-label="Abrir navegação"/i);
    assert.doesNotMatch(html, /aria-label="Acessos diretos do portal"|aria-label="Ações diretas recomendadas"|class="portal-sections"|class="next-actions"/i);
  }
});

test("renderiza o ciclo de privacidade como Mermaid vetorial e responsivo", async () => {
  const [source, privacy, theme, packageJson] = await Promise.all([
    readFile(new URL("../app/mermaid-diagram.tsx", import.meta.url), "utf8"),
    readFile(new URL("privacidade/index.html", outputRoot), "utf8"),
    readFile(new URL("../app/glass-system.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(packageJson, /"mermaid": "\^11\.16\.0"/i);
  assert.match(source, /await import\("mermaid"\)/i);
  assert.match(source, /IntersectionObserver[\s\S]*rootMargin: "320px 0px"/i);
  assert.match(source, /if \(!shouldRender\) return/i);
  assert.match(source, /securityLevel: "strict"/i);
  assert.match(source, /window\.matchMedia\("\(max-width: 780px\)"\)/i);
  assert.match(source, /htmlLabels: true[\s\S]*flowchart:/i);
  assert.match(source, /role=\{failed \? undefined : "img"\}[\s\S]*aria-label=\{failed \? undefined : ariaLabel\}/i);
  assert.match(privacy, /Ciclo dos dados[\s\S]*Finalidade do início ao encerramento/i);
  assert.match(privacy, /Coletar o necessário[\s\S]*Usar com finalidade[\s\S]*Proteger e limitar[\s\S]*Reter ou eliminar/i);
  assert.match(theme, /\.mermaid-diagram__surface svg[\s\S]*width: 100% !important/i);
  assert.doesNotMatch(theme, /\.legal-body > h2::before/i);
});

test("publica sem alteração a cadeia GOV.BR indicada na fonte oficial", async () => {
  const chain = await readFile(new URL("../public/certificados/Cadeia_GovBr-der.p7b", import.meta.url));
  assert.equal(chain.length, 5_364);
  assert.equal(createHash("sha256").update(chain).digest("hex"), "dbf22f7c15ace9c37e6b4141271695a17dc445b5a04c003ced94322ad905879f");
});

test("oferece somente o artefato operacional validado da extensão PAdES", async () => {
  const [page, panel] = await Promise.all([
    readFile(new URL("certificado-icp-brasil/index.html", outputRoot), "utf8"),
    readFile(new URL("../app/assinar-icp/private-pades-panel.tsx", import.meta.url), "utf8"),
  ]);
  const asset = /https:\/\/github\.com\/rogermaiocchi\/maiocchi-pades-token-extension\/releases\/download\/v1\.0\.1\/maiocchi-pades-token-extension-v1\.0\.1\.zip/;
  assert.match(page, asset);
  assert.match(panel, asset);
  assert.doesNotMatch(page, /github\.com\/rogermaiocchi\/maiocchi-pades-token-extension(?:["'\s<]|$)/);
  assert.match(page, /CryptoTokenKit.*CNG.*p11-kit\/PKCS#11/i);
});

test("não expõe código no portal e conserva a fonte correspondente fora da raiz pública", async () => {
  const [archive, redesignPatch, sourcePatch, emailPatch, simplifiedEmailPatch, certificatePatch, directAuthPatch, chromeSource, outputFiles] = await Promise.all([
    readFile(new URL("../compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz", import.meta.url)),
    readFile(new URL("../patches/docuseal/0002-institutional-signing-window.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0003-unified-contact-and-source-surface.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0004-unified-email-standard.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0008-simplified-email-standard.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0005-certificate-header-compatibility.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0006-direct-authentication-flow.patch", import.meta.url), "utf8"),
    readFile(new URL("../app/site-chrome.tsx", import.meta.url), "utf8"),
    readdir(outputRoot, { recursive: true }),
  ]);

  assert.ok(archive.length > 1_000_000, "o arquivo-fonte deve conter o fork completo e suas licenças");
  assert.equal(
    createHash("sha256").update(archive).digest("hex"),
    "e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c",
  );
  await assert.rejects(
    stat(new URL("../public/codigo-fonte/docuseal-maiocchi-3.0.1.tar.gz", import.meta.url)),
    (error) => error?.code === "ENOENT",
  );
  await assert.rejects(
    readFile(new URL("../app/codigo-fonte/page.tsx", import.meta.url), "utf8"),
    (error) => error?.code === "ENOENT",
  );
  assert.doesNotMatch(chromeSource, /codigo-fonte|Code2/i);
  assert.match(directAuthPatch, /dashboard_index_path/i);
  assert.match(directAuthPatch, /submit-form/i);
  const renderedHtml = await Promise.all(
    outputFiles.filter((file) => file.endsWith(".html")).map((file) => readFile(new URL(file, outputRoot), "utf8")),
  );
  for (const html of renderedHtml) {
    assert.doesNotMatch(html, /codigo-fonte|github\.com\/rogermaiocchi\/maiocchi-assinaturas/i);
  }
  const addedSourceLines = sourcePatch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  assert.match(addedSourceLines, /roger@maiocchi\.adv\.br/i);
  assert.match(addedSourceLines, /Fonte correspondente \(AGPL\)/i);
  assert.doesNotMatch(addedSourceLines, /admin@maiocchi\.adv\.br|support@docuseal\.com/i);
  assert.match(redesignPatch, /maiocchi-signing-bar/i);
  assert.match(redesignPatch, /maiocchi-signing-nav/i);
  assert.match(redesignPatch, /render 'shared\/logo'/i);
  assert.match(redesignPatch, /^-\s*radial-gradient/m);
  assert.doesNotMatch(redesignPatch, /^\+\s*radial-gradient/m);
  assert.match(emailPatch, /data-maiocchi-email-standard/i);
  assert.match(emailPatch, /data-automatic-email-notice/i);
  assert.match(emailPatch, /MaiocchiBrand::SUPPORT_EMAIL/i);
  const simplifiedEmailAddedLines = simplifiedEmailPatch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++") && !line.includes("expect("))
    .join("\n");
  assert.match(simplifiedEmailAddedLines, /data-automatic-email-icon/i);
  assert.match(simplifiedEmailAddedLines, /LAWYER_SIGNATURE = 'Roger Maiocchi'/i);
  assert.doesNotMatch(simplifiedEmailAddedLines, /border-top:3pt solid #ffc400/i);
  assert.doesNotMatch(simplifiedEmailAddedLines, /Advogado Roger Maiocchi/i);
  assert.match(certificatePatch, /Base64\.strict_decode64/i);
  assert.match(certificatePatch, /decode_percent_escapes_preserving_plus/i);
  assert.match(certificatePatch, /raw Base64 certificate in a Traefik chain/i);
});

test("publica identidade de navegador Maiocchi", async () => {
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", outputRoot), "utf8"));
  assert.equal(manifest.short_name, "Maiocchi");
  assert.equal(manifest.name, "Maiocchi — documentos e assinaturas");

  for (const asset of ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]) {
    const bytes = await readFile(new URL(asset, outputRoot));
    assert.ok(bytes.length > 256, `${asset} deve ser um arquivo de imagem real`);
  }
});

test("padroniza páginas inexistentes e redirecionamentos internos", async () => {
  const [notFound, nginx, traefik, docuseal] = await Promise.all([
    readFile(new URL("404.html", outputRoot), "utf8"),
    readFile(new URL("../nginx.conf", import.meta.url), "utf8"),
    readFile(new URL("../deploy/traefik-assinatura.yml", import.meta.url), "utf8"),
    readFile(new URL("../deploy/docuseal.yml", import.meta.url), "utf8"),
  ]);
  assert.match(notFound, /Esta página não está disponível/i);
  assert.match(notFound, /Endereço não encontrado/i);
  assert.match(notFound, /page-hero page-hero--dark page-hero--not-found/i);
  assert.match(notFound, /aria-label="Caminho da página"/i);
  assert.match(notFound, /<p class="eyebrow">Endereço não encontrado<\/p>/i);
  assert.doesNotMatch(notFound, /status-dot/);
  assert.match(notFound, /maiocchi-mark-light\.svg/i);
  assert.doesNotMatch(notFound, /not-found-actions|>Voltar ao início<|>Preciso de ajuda<|Erro 404|Responsável: Roger Maiocchi/i);
  assert.match(notFound, /Termos de serviço/i);
  assert.match(notFound, /Política de privacidade/i);
  assert.match(nginx, /absolute_redirect off;/i);
  assert.match(nginx, /error_page 404 \/404\.html;/i);
  assert.match(nginx, /frame-src 'self' https:\/\/validar\.iti\.gov\.br/i);
  assert.match(nginx, /location = \/validar\//i);
  assert.doesNotMatch(nginx, /documentos\.assinatura\.maiocchi\.adv\.br/i);
  assert.match(traefik, /docuseal-main-paths:/i);
  assert.match(traefik, /assinatura-legal-source:/i);
  assert.match(traefik, /priority: 340[\s\S]*Path\(`\/legal\/LICENSE[.]txt`\)[\s\S]*Path\(`\/legal\/source\/docuseal-maiocchi-3[.]0[.]1-maiocchi[.]15[.]tar[.]gz`\)[\s\S]*service: assinatura-portal-svc/i);
  assert.match(traefik, /portal-auth-session:/i);
  assert.match(traefik, /portal-auth-certificate:/i);
  assert.match(traefik, /legacy-sign-in:/i);
  assert.match(traefik, /Path\(`\/sign_in`\) \|\| Path\(`\/sign_in\/`\)/i);
  assert.match(traefik, /PathPrefix\(`\/chaves-pqc\/`\)/i);
  assert.match(traefik, /documents-to-main:/i);
  assert.match(traefik, /replacement: 'https:\/\/assinatura\.maiocchi\.adv\.br\/\$\{1\}'/i);
  assert.match(docuseal, /APP_URL: https:\/\/assinatura\.maiocchi\.adv\.br/i);
  assert.match(docuseal, /image: maiocchi\/docuseal:3\.0\.1-maiocchi\.14/i);
  assert.match(docuseal, /DEFAULT_LOCALE: pt/i);
  assert.match(docuseal, /CERTIFICATE_AUTH_APP_HOST: assinatura\.maiocchi\.adv\.br/i);
  assert.match(docuseal, /PRIVATE_PADES_BRIDGE_URL: http:\/\/pki-bridge-internal:3401\/internal\/pades\/tickets/i);
  assert.match(docuseal, /PRIVATE_EVIDENCE_COMPOSER_URL: http:\/\/pki-bridge-internal:3401\/internal\/evidence\/compose/i);
  assert.match(docuseal, /AUTHENTICITY_INTERNAL_HMAC_KEY_FILE: \/run\/signature-secrets\/internal-hmac[.]key/i);
  assert.match(docuseal, /SMTP_ADDRESS: smtp\.mail\.me\.com/i);
  assert.match(docuseal, /SMTP_PORT: "587"/i);
  assert.match(docuseal, /SMTP_DOMAIN: maiocchi\.adv\.br/i);
  assert.match(docuseal, /SMTP_USERNAME: "\$\{SMTP_USERNAME:\?/i);
  assert.match(docuseal, /SMTP_PASSWORD: "\$\{SMTP_PASSWORD:\?/i);
  assert.match(docuseal, /SMTP_AUTHENTICATION: plain/i);
  assert.match(docuseal, /SMTP_ENABLE_STARTTLS: "true"/i);
  assert.match(docuseal, /SMTP_ENABLE_SSL: "false"/i);
  assert.match(docuseal, /SMTP_ENABLE_TLS: "false"/i);
  assert.match(docuseal, /SMTP_SSL_VERIFY: "true"/i);
  assert.match(docuseal, /SMTP_FROM: "Maiocchi\. Assinatura <roger@maiocchi\.adv\.br>"/i);
  assert.match(docuseal, /MAIOCCHI_SOURCE_URL: https:\/\/assinatura[.]maiocchi[.]adv[.]br\/legal\/source\/docuseal-maiocchi-3[.]0[.]1-maiocchi[.]15[.]tar[.]gz/i);
  assert.doesNotMatch(docuseal, /assinatura\.maiocchi\.adv\.br\/codigo-fonte/i);
  assert.equal(docuseal.match(/^\s*SMTP_PASSWORD:/gim)?.length, 1);
  assert.match(docuseal, /^\s*SMTP_PASSWORD: "\$\{SMTP_PASSWORD:\?defina SMTP_PASSWORD em \/opt\/docuseal\/\.env\}"$/im);
  assert.doesNotMatch(docuseal, /documentos\.assinatura\.maiocchi\.adv\.br/i);
});
