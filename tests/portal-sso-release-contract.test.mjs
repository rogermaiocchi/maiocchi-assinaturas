import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pkg, lock, dockerfile, compose, access, theme, dockerignore] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../compose.yml", import.meta.url), "utf8"),
  readFile(new URL("../app/lawyer-access.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/glass-system.css", import.meta.url), "utf8"),
  readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
]);

test("portal SSO possui uma única versão candidata coerente", () => {
  assert.equal(pkg.version, "1.15.1");
  assert.equal(lock.version, "1.15.1");
  assert.equal(lock.packages[""].version, "1.15.1");
  assert.match(dockerfile, /org[.]opencontainers[.]image[.]version="1[.]15[.]1"/);
  assert.match(dockerfile, /org[.]opencontainers[.]image[.]source="https:\/\/github[.]com\/rogermaiocchi\/maiocchi-assinaturas"/);
  assert.match(dockerfile, /org[.]opencontainers[.]image[.]description="Portal estático de assinaturas do Maiocchi Advogado"/);
  assert.match(dockerfile, /org[.]opencontainers[.]image[.]url="https:\/\/assinatura[.]maiocchi[.]adv[.]br"/);
  assert.match(dockerfile, /org[.]opencontainers[.]image[.]created="2026-07-18T00:00:00Z"/);
  assert.match(dockerfile, /org[.]opencontainers[.]image[.]licenses="NOASSERTION"/);
  assert.doesNotMatch(dockerfile, /tree\/portal-v1[.]15[.]1/);
  assert.match(compose, /image: maiocchi\/assinatura-portal:1[.]15[.]1/);
  assert.doesNotMatch(dockerfile, /1[.]15[.]0/);
  assert.doesNotMatch(compose, /1[.]15[.]0/);
});

test("ambas as imagens-base estão fixadas por digest", () => {
  const fromLines = dockerfile.match(/^FROM .+$/gm) || [];
  assert.equal(fromLines.length, 2);
  for (const line of fromLines) assert.match(line, /@sha256:[0-9a-f]{64}/);
});

test("botão SSO depende de gate público explícito e certificado/senha continuam disponíveis", () => {
  assert.match(access, /NEXT_PUBLIC_MAIOCCHI_SSO_ENABLED === "true"/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_MAIOCCHI_SSO_ENABLED=false/);
  assert.match(access, /Entrar com Portal Maiocchi/);
  assert.match(access, /window[.]location[.]assign\("\/sso\/maiocchi\/start"\)/);
  assert.match(access, /Entrar com certificado/);
  assert.match(access, /AccessMethod = "certificate" \| "password"/);
  assert.match(theme, /[.]portal-band--workspace [.]integrated-access/);
});

test("contexto Docker exclui evidência, serviços executáveis e duplicados locais", () => {
  for (const ignored of ["compliance", "deploy", "docs", "patches", "scripts", "services", "tests"]) {
    assert.match(dockerignore, new RegExp(`^${ignored}$`, "m"));
  }
  assert.deepEqual(
    [...dockerignore.matchAll(/^!(services\/.*)$/gm)].map((match) => match[1]),
    [
      "services/",
      "services/pki-bridge/",
      "services/pki-bridge/src/",
      "services/pki-bridge/src/pades-evidence-layout.mjs",
    ],
  );
  assert.match(dockerignore, /^services\/pki-bridge\/src\/\*$/m);
  assert.match(dockerignore, /^\*\*\/\* 2[.]\*$/m);
  assert.match(dockerignore, /^\*\*\/\* 3[.]\*$/m);
});
