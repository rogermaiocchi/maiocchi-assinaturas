import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

test("renderiza a porta de entrada Maiocchi", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /<title>Maiocchi\. Assinatura \| Maiocchi Advogado<\/title>/i);
  assert.match(html, /Recebeu um documento\?/i);
  assert.match(html, /Serviço de apoio ao cliente/i);
  assert.match(html, /<h1 class="hero-title">Assinatura digital<\/h1>/i);
  assert.doesNotMatch(html, /Maiocchi<span>\.<\/span> <strong>Assinatura<\/strong>/i);
  assert.equal((html.match(/class="icon-nav-link"/g) || []).length, 3);
  assert.match(html, /class="brand__mark"/i);
  assert.doesNotMatch(html, /class="brand__mark"[^>]*src=/i);
  assert.doesNotMatch(html, /class="brand__name"/i);
  assert.doesNotMatch(html, /Ir para o conteúdo principal/i);
  assert.match(html, /id="conteudo-principal"/i);
  assert.match(html, /href="\/ajuda\/"[^>]*>[\s\S]*Acessar central de ajuda/i);
  assert.doesNotMatch(html, /<div class="footer-summary">\s*<strong>Maiocchi\. Assinatura<\/strong>/i);
  assert.match(html, /Área dos advogados/i);
  assert.match(html, /Área dos advogados, sem página intermediária/i);
  assert.match(html, /Entrar com certificado digital/i);
  assert.doesNotMatch(html, /href="[^"]*\/dashboard/i);
  assert.doesNotMatch(html, /href="[^"]*\/sign_in/i);
  assert.doesNotMatch(html, /documentos\.assinatura\.maiocchi\.adv\.br/i);
  assert.match(html, /ICP-BRASIL/i);
  assert.match(html, /\/certificado-icp-brasil\//i);
  assert.doesNotMatch(html, /roger@maiocchi\.adv\.br/i);
  assert.match(html, /src="https:\/\/validar\.iti\.gov\.br\/"/i);
  assert.match(html, /Responsável: Roger Maiocchi, OAB\/DF 31\.249\./i);
  assert.match(html, /\/assinaturas-eletronicas\//i);
  assert.match(html, /\/assinatura-gov-br\//i);
  assert.doesNotMatch(html, /admin@maiocchi\.adv\.br|contato@maiocchi\.adv\.br|Maiocchi Advocacia/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
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
  assert.match(accessSource, /if \(session\.kind === "authenticated"\)[\s\S]*confirmAccess\(\)/i);
  assert.doesNotMatch(accessSource, /response\.ok && destination === "\/" \|\| destination === "\/dashboard"/i);
  assert.match(accessSource, /role="tablist"/i);
  assert.match(accessSource, /aria-selected=\{accessMethod === "certificate"\}/i);
  assert.match(dashboardPatch, /redirect_to.*#advogados/i);
  assert.match(traefik, /replacePath:[\s\S]*path: \/sign_in/i);
  assert.match(traefik, /sign-in-to-home/i);
  assert.match(
    traefik,
    /maiocchi-icp-client-auth:[\s\S]*minVersion: VersionTLS12[\s\S]*maxVersion: VersionTLS12[\s\S]*TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256[\s\S]*TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384[\s\S]*clientAuthType: VerifyClientCertIfGiven/i,
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
      "hero-roger-maiocchi-hd.webp",
      "hero-access-professional.webp",
      "hero-validation-glass.webp",
      "hero-evidence-gold.webp",
    ].map((asset) => stat(new URL(`../public/${asset}`, import.meta.url))),
  ]);

  assert.match(layout, /import "[.]\/glass-system[.]css"/i);
  assert.match(theme, /--glass-blur: blur\(24px\) saturate\(118%\)/i);
  assert.match(theme, /url\("\/hero-roger-maiocchi-hd[.]webp"\)/i);
  assert.match(theme, /url\("\/hero-access-professional[.]webp"\)/i);
  assert.match(theme, /url\("\/hero-validation-glass[.]webp"\)/i);
  assert.match(theme, /url\("\/hero-evidence-gold[.]webp"\)/i);
  assert.match(theme, /@media \(max-width: 720px\)/i);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)/i);
  assert.match(home, /Método de acesso profissional/i);
  assert.match(home, /Certificado/i);
  assert.match(home, /Senha/i);
  for (const asset of assets) assert.ok(asset.size > 100_000, "cada imagem editorial deve ser um WebP real de alta resolução");
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

test("mantém navegação contextual e fluxos visuais em todo o portal", async () => {
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
  const home = await readFile(new URL("index.html", outputRoot), "utf8");

  assert.match(home, /class="flow-map"/i);
  for (const html of pages) {
    assert.match(html, /aria-label="Acessos diretos do portal"/i);
    assert.match(html, /class="flow-map"/i);
    assert.match(html, /aria-label="Ações diretas recomendadas"/i);
    assert.match(html, /aria-label="Abrir navegação"/i);
  }
});

test("publica sem alteração a cadeia GOV.BR indicada na fonte oficial", async () => {
  const chain = await readFile(new URL("../public/certificados/Cadeia_GovBr-der.p7b", import.meta.url));
  assert.equal(chain.length, 5_364);
  assert.equal(createHash("sha256").update(chain).digest("hex"), "dbf22f7c15ace9c37e6b4141271695a17dc445b5a04c003ced94322ad905879f");
});

test("não expõe código no portal e conserva a fonte correspondente fora da raiz pública", async () => {
  const [archive, redesignPatch, sourcePatch, emailPatch, certificatePatch, chromeSource, outputFiles] = await Promise.all([
    readFile(new URL("../compliance/docuseal-maiocchi-3.0.1-maiocchi.11.tar.gz", import.meta.url)),
    readFile(new URL("../patches/docuseal/0002-institutional-signing-window.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0003-unified-contact-and-source-surface.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0004-unified-email-standard.patch", import.meta.url), "utf8"),
    readFile(new URL("../patches/docuseal/0005-certificate-header-compatibility.patch", import.meta.url), "utf8"),
    readFile(new URL("../app/site-chrome.tsx", import.meta.url), "utf8"),
    readdir(outputRoot, { recursive: true }),
  ]);

  assert.ok(archive.length > 1_000_000, "o arquivo-fonte deve conter o fork completo e suas licenças");
  assert.equal(
    createHash("sha256").update(archive).digest("hex"),
    "91d143ebfa9f37c6019094b7ba4e621e123431aa077e2cd10652439191016898",
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
  assert.match(emailPatch, /border-top:3pt solid #ffc400/i);
  assert.match(emailPatch, /Advogado Roger Maiocchi/i);
  assert.match(emailPatch, /data-automatic-email-notice/i);
  assert.match(emailPatch, /MaiocchiBrand::SUPPORT_EMAIL/i);
  assert.match(certificatePatch, /Base64\.strict_decode64/i);
  assert.match(certificatePatch, /decode_percent_escapes_preserving_plus/i);
  assert.match(certificatePatch, /raw Base64 certificate in a Traefik chain/i);
});

test("publica identidade de navegador Maiocchi", async () => {
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", outputRoot), "utf8"));
  assert.equal(manifest.short_name, "Maiocchi");
  assert.match(manifest.name, /Maiocchi Advogado/i);

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
  assert.match(notFound, /Esta página não foi encontrada/i);
  assert.match(notFound, /Maiocchi Advogado/i);
  assert.match(nginx, /absolute_redirect off;/i);
  assert.match(nginx, /error_page 404 \/404\.html;/i);
  assert.match(nginx, /frame-src 'self' https:\/\/validar\.iti\.gov\.br/i);
  assert.match(nginx, /location = \/validar\//i);
  assert.doesNotMatch(nginx, /documentos\.assinatura\.maiocchi\.adv\.br/i);
  assert.match(traefik, /docuseal-main-paths:/i);
  assert.match(traefik, /portal-auth-session:/i);
  assert.match(traefik, /portal-auth-certificate:/i);
  assert.match(traefik, /legacy-sign-in:/i);
  assert.match(traefik, /PathPrefix\(`\/chaves-pqc\/`\)/i);
  assert.match(traefik, /documents-to-main:/i);
  assert.match(traefik, /replacement: 'https:\/\/assinatura\.maiocchi\.adv\.br\/\$\{1\}'/i);
  assert.match(docuseal, /APP_URL: https:\/\/assinatura\.maiocchi\.adv\.br/i);
  assert.match(docuseal, /image: maiocchi\/docuseal:3\.0\.1-maiocchi\.11/i);
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
  assert.doesNotMatch(docuseal, /MAIOCCHI_SOURCE_URL:/i);
  assert.doesNotMatch(docuseal, /assinatura\.maiocchi\.adv\.br\/codigo-fonte/i);
  assert.equal(docuseal.match(/^\s*SMTP_PASSWORD:/gim)?.length, 1);
  assert.match(docuseal, /^\s*SMTP_PASSWORD: "\$\{SMTP_PASSWORD:\?defina SMTP_PASSWORD em \/opt\/docuseal\/\.env\}"$/im);
  assert.doesNotMatch(docuseal, /documentos\.assinatura\.maiocchi\.adv\.br/i);
});
