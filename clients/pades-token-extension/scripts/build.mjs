import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const sharedBuildOptions = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  legalComments: "none",
  tsconfigRaw: { compilerOptions: { alwaysStrict: true } },
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  build({ ...sharedBuildOptions, entryPoints: [join(root, "src", "content.mjs")], outfile: join(root, "content.js"), format: "iife" }),
  build({ ...sharedBuildOptions, entryPoints: [join(root, "src", "content.mjs")], outfile: join(dist, "content.js"), format: "iife" }),
  build({ ...sharedBuildOptions, entryPoints: [join(root, "background.js")], outfile: join(dist, "background.js"), format: "esm" }),
  build({ ...sharedBuildOptions, entryPoints: [join(root, "popup.js")], outfile: join(dist, "popup.js"), format: "iife" }),
]);

await Promise.all([
  cp(join(root, "manifest.json"), join(dist, "manifest.json")),
  cp(join(root, "popup.html"), join(dist, "popup.html")),
  cp(join(root, "popup.css"), join(dist, "popup.css")),
  cp(join(root, "LICENSE"), join(dist, "LICENSE")),
  cp(join(root, "README.md"), join(dist, "README.md")),
  cp(join(root, "SECURITY.md"), join(dist, "SECURITY.md")),
  cp(join(root, "THIRD_PARTY_NOTICES.md"), join(dist, "THIRD_PARTY_NOTICES.md")),
  cp(join(root, "icons"), join(dist, "icons"), { recursive: true }),
]);
