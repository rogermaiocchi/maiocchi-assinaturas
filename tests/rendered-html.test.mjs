import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

test("renderiza a porta de entrada Maiocchi", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /<title>Maiocchi Assinaturas \| Maiocchi Advogado<\/title>/i);
  assert.match(html, /Recebeu um documento\?/i);
  assert.match(html, /Maiocchi <span>Assinaturas\.<\/span>/i);
  assert.match(html, /class="brand__mark"/i);
  assert.doesNotMatch(html, /class="brand__mark"[^>]*src=/i);
  assert.doesNotMatch(html, /class="brand__name"/i);
  assert.match(html, /Ir para o conteúdo principal/i);
  assert.match(html, /id="conteudo-principal"/i);
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
  assert.match(accessSource, /credentials: "same-origin"/i);
  assert.match(dashboardPatch, /redirect_to.*#advogados/i);
  assert.match(traefik, /replacePath:[\s\S]*path: \/sign_in/i);
  assert.match(traefik, /sign-in-to-home/i);
  assert.match(nginx, /return 302 \/\$is_args\$args#validar;/i);
});

test("publica páginas legais e de ajuda", async () => {
  const [privacy, terms, help, source] = await Promise.all([
    readFile(new URL("privacidade/index.html", outputRoot), "utf8"),
    readFile(new URL("termos/index.html", outputRoot), "utf8"),
    readFile(new URL("ajuda/index.html", outputRoot), "utf8"),
    readFile(new URL("codigo-fonte/index.html", outputRoot), "utf8"),
  ]);
  assert.match(privacy, /Política de privacidade/i);
  assert.match(privacy, /OAB\/DF 31\.249/i);
  assert.match(privacy, /Direitos do titular/i);
  assert.match(terms, /Condições para acessar/i);
  assert.match(terms, /OAB\/DF/i);
  assert.match(help, /Assinatura com certificado ICP-Brasil/i);
  assert.match(source, /GNU Affero General Public License/i);
  assert.match(source, /github\.com\/rogermaiocchi\/maiocchi-assinaturas\/archive\/refs\/tags\/portal-v1\.9\.0\.zip/i);
  assert.match(source, /github\.com\/rogermaiocchi\/maiocchi-assinaturas\/tree\/portal-v1\.9\.0/i);
  assert.doesNotMatch(source, /href="\/codigo-fonte\/docuseal-maiocchi-3\.0\.1\.tar\.gz"/i);
  assert.doesNotMatch(source, /termos adicionais/i);
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
  assert.match(pages[2], /CryptoTokenKit no MacBook/i);
  assert.match(pages[2], /Maiocchi PAdES/i);
  assert.match(pages[2], /Verificar agente e token/i);
  assert.match(pages[2], /DSS \+ CryptoTokenKit/i);
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
    "codigo-fonte",
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

test("publica o código-fonte correspondente da aplicação de assinaturas", async () => {
  const archive = await stat(new URL("../public/codigo-fonte/docuseal-maiocchi-3.0.1.tar.gz", import.meta.url));

  assert.ok(archive.isFile());
  assert.ok(archive.size > 1_000_000, "o arquivo-fonte deve conter o fork completo e suas licenças");
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
  assert.match(traefik, /documents-to-main:/i);
  assert.match(traefik, /replacement: 'https:\/\/assinatura\.maiocchi\.adv\.br\/\$\{1\}'/i);
  assert.match(docuseal, /APP_URL: https:\/\/assinatura\.maiocchi\.adv\.br/i);
  assert.match(docuseal, /CERTIFICATE_AUTH_APP_HOST: assinatura\.maiocchi\.adv\.br/i);
  assert.doesNotMatch(docuseal, /documentos\.assinatura\.maiocchi\.adv\.br/i);
});
