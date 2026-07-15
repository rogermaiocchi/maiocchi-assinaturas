import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, "module");
assert.deepEqual(manifest.permissions, []);
assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1:35100/*"]);
assert.equal(manifest.content_scripts[0].type, undefined);
assert.equal(manifest.content_scripts[0].matches.length, 1);
assert.match(manifest.key, /^MIIBI/);

for (const name of ["background.js", "content.js", "popup.js"]) {
  const source = await readFile(join(dist, name), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(/);
  assert.doesNotMatch(source, /https?:\/\/(?!127\.0\.0\.1:35100|assinatura\.maiocchi\.adv\.br)/);
}

const rootContentScript = await readFile(join(root, "content.js"), "utf8");
assert.doesNotMatch(rootContentScript, /^\s*(?:import|export)\s/m);
assert.match(rootContentScript, /maiocchi-pades-extension/);

for (const size of [16, 32, 48, 128]) {
  assert.ok((await stat(join(dist, "icons", `icon-${size}.png`))).size > 100);
}

const files = await readdir(dist, { recursive: true });
assert.equal(files.some((name) => name.endsWith(".map")), false);
console.log(`dist=ok files=${files.length} manifest=v${manifest.manifest_version}`);
