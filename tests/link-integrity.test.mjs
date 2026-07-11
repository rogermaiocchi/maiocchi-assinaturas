import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const outputRoot = fileURLToPath(new URL("../out/", import.meta.url));

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith("_")) return htmlFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
  }));
  return nested.flat();
}

function targetFor(href) {
  const pathname = href.split(/[?#]/, 1)[0];
  if (pathname === "/") return path.join(outputRoot, "index.html");
  const relative = pathname.replace(/^\//, "");
  return pathname.endsWith("/")
    ? path.join(outputRoot, relative, "index.html")
    : path.join(outputRoot, relative);
}

test("todos os links internos publicados resolvem no artefato estático", async () => {
  const missing = [];

  for (const file of await htmlFiles(outputRoot)) {
    const html = await readFile(file, "utf8");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    for (const href of new Set(hrefs)) {
      if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/_next/")) continue;
      try {
        await access(targetFor(href));
      } catch {
        missing.push(`${path.relative(outputRoot, file)} -> ${href}`);
      }
    }
  }

  assert.deepEqual(missing, [], `links internos sem destino:\n${missing.join("\n")}`);
});
