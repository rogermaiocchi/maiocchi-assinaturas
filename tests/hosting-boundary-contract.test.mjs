import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [hosting, worker, readme, dockerfile, traefik, packageSource, servicePackageSource] = await Promise.all([
  readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
  readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../deploy/traefik-assinatura.yml", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../services/pki-bridge/package.json", import.meta.url), "utf8"),
]);

const pkg = JSON.parse(packageSource);
const servicePkg = JSON.parse(servicePackageSource);

test("VPS e Traefik são o único alvo de produção operacional", () => {
  assert.match(readme, /Produção: `npm run build` gera `out\/`/);
  assert.match(readme, /Nginx na VPS/);
  assert.match(readme, /Sites:[\s\S]*espelho privado de preview/);
  assert.match(readme, /Worker Vinext não substitui os proxies operacionais do Traefik/);
  assert.match(dockerfile, /COPY --from=builder \/app\/out \/usr\/share\/nginx\/html/);
  assert.match(traefik, /portal-auth-session:[\s\S]*service: docuseal-svc/);
  assert.match(traefik, /autenticidade-publica:[\s\S]*service: pki-bridge-svc/);
});

test("Sites permanece um preview incapaz de assumir o domínio produtivo", () => {
  assert.deepEqual(Object.keys(hosting).sort(), ["d1", "project_id", "r2"]);
  assert.equal(hosting.d1, null);
  assert.equal(hosting.r2, null);
  assert.match(pkg.scripts["build:sites"], /SITES_BUILD=1/);
  assert.match(worker, /productionHostname = "assinatura[.]maiocchi[.]adv[.]br"/);
  assert.match(worker, /status: 421/);
  assert.match(worker, /handler[.]fetch\(request, env, ctx\)/);
  assert.doesNotMatch(worker, /portal-auth|pki-public|assinatura-docuseal-svc/);
});

test("overrides de segurança possuem uma única autoridade JSON", () => {
  assert.equal(packageSource.match(/"overrides"\s*:/g)?.length, 1);
  assert.equal(pkg.overrides.postcss, "8.5.16");
  assert.equal(pkg.overrides.sharp, "0.35.3");
  assert.equal(pkg.overrides["fast-uri"], "3.1.4");
  assert.equal(pkg.overrides["minimatch@3.1.5"]["brace-expansion"], "1.1.16");
  assert.equal(pkg.overrides["minimatch@10.2.5"]["brace-expansion"], "5.0.7");
  assert.equal(servicePackageSource.match(/"overrides"\s*:/g)?.length, 1);
  assert.equal(servicePkg.overrides["fast-uri"], "3.1.4");
});
