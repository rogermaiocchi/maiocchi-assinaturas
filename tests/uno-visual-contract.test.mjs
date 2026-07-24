import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, base, unified, home, regularFont, boldFont, fontLicense] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../app/glass-system.css", import.meta.url), "utf8"),
  readFile(new URL("../app/portal-home.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/fonts/inter-latin-400-normal.woff", import.meta.url)),
  readFile(new URL("../app/fonts/inter-latin-700-normal.woff", import.meta.url)),
  readFile(new URL("../app/fonts/FONT-LICENSE-Inter.txt", import.meta.url), "utf8"),
]);

test("portal de assinaturas usa os tokens tipográficos UNO", () => {
  assert.match(layout, /next\/font\/local/);
  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.match(layout, /inter-latin-400-normal[.]woff/);
  assert.match(layout, /inter-latin-700-normal[.]woff/);
  assert.ok(regularFont.length > 10_000);
  assert.ok(boldFont.length > 10_000);
  assert.match(fontLicense, /SIL OPEN FONT LICENSE/i);
  assert.match(base, /@import "tailwindcss" source\(none\)/);
  assert.match(base, /--max: 1200px/);
  assert.match(base, /--radius: 8px/);
  assert.match(base, /font-family: var\(--font-inter\)/);
  assert.match(base, /--paper: #f5f5f3/);
  assert.match(base, /--line: #d5d5d0/);
  assert.match(base, /letter-spacing: 0 !important/);
  for (const token of ["ink", "ink-soft", "paper", "white", "yellow", "yellow-soft", "line", "muted", "focus", "radius", "control-height"]) {
    assert.equal((`${base}\n${unified}`.match(new RegExp(`^\\s*--${token}:`, "gm")) || []).length, 1, `${token} deve ter uma única fonte`);
  }
});

test("títulos não escalam pela largura do viewport", () => {
  assert.doesNotMatch(`${base}\n${unified}`, /font-size:\s*clamp\([^;]*vw/);
});

test("hero principal da assinatura usa imagem própria da função", () => {
  assert.match(home, /src="\/hero-assinaturas[.]webp"/);
  assert.doesNotMatch(home, /src="\/hero-home-maiocchi[.]webp"/);
});
