import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

test("renderiza a porta de entrada Maiocchi", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /<title>Maiocchi Assinaturas \| Roger Maiocchi, advogado<\/title>/i);
  assert.match(html, /Recebeu um documento\?/i);
  assert.match(html, /Área dos advogados/i);
  assert.match(html, /documentos\.assinatura\.maiocchi\.adv\.br\/sign_in/i);
  assert.match(html, /ICP-BRASIL/i);
  assert.match(html, /admin@maiocchi\.adv\.br/i);
  assert.doesNotMatch(html, /contato@maiocchi\.adv\.br|Maiocchi Advocacia/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publica páginas legais e de ajuda", async () => {
  const [privacy, terms, help, source] = await Promise.all([
    readFile(new URL("privacidade/index.html", outputRoot), "utf8"),
    readFile(new URL("termos/index.html", outputRoot), "utf8"),
    readFile(new URL("ajuda/index.html", outputRoot), "utf8"),
    readFile(new URL("codigo-fonte/index.html", outputRoot), "utf8"),
  ]);
  assert.match(privacy, /Como tratamos dados pessoais/i);
  assert.match(terms, /Condições essenciais/i);
  assert.match(help, /O token ICP-Brasil pede PIN/i);
  assert.match(source, /GNU Affero General Public License/i);
  assert.match(source, /docuseal-maiocchi-3\.0\.1\.tar\.gz/i);
  for (const html of [privacy, terms, help]) {
    assert.match(html, /admin@maiocchi\.adv\.br|Roger Maiocchi, advogado/i);
    assert.doesNotMatch(html, /contato@maiocchi\.adv\.br|Maiocchi Advocacia/i);
  }
});

test("publica o código-fonte correspondente da aplicação de assinaturas", async () => {
  const archive = await stat(new URL("../public/codigo-fonte/docuseal-maiocchi-3.0.1.tar.gz", import.meta.url));

  assert.ok(archive.isFile());
  assert.ok(archive.size > 1_000_000, "o arquivo-fonte deve conter o fork completo e suas licenças");
});

test("publica identidade de navegador Maiocchi", async () => {
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", outputRoot), "utf8"));
  assert.equal(manifest.short_name, "Maiocchi");
  assert.match(manifest.name, /Roger Maiocchi, advogado/i);

  for (const asset of ["favicon.ico", "favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]) {
    const bytes = await readFile(new URL(asset, outputRoot));
    assert.ok(bytes.length > 256, `${asset} deve ser um arquivo de imagem real`);
  }
});

test("padroniza páginas inexistentes e redirecionamentos internos", async () => {
  const [notFound, nginx] = await Promise.all([
    readFile(new URL("404.html", outputRoot), "utf8"),
    readFile(new URL("../nginx.conf", import.meta.url), "utf8"),
  ]);
  assert.match(notFound, /Esta página não foi encontrada/i);
  assert.match(notFound, /Roger Maiocchi, advogado/i);
  assert.match(nginx, /absolute_redirect off;/i);
  assert.match(nginx, /error_page 404 \/404\.html;/i);
  assert.match(nginx, /\^\/\(s\|d\|e\|p\)\/\.\+\$/i);
  assert.match(nginx, /308 https:\/\/documentos\.assinatura\.maiocchi\.adv\.br\$request_uri/i);
});
