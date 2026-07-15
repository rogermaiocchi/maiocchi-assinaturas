import { mkdir, readFile, readdir, rm, utimes } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const release = join(root, "release");
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const output = join(release, `maiocchi-pades-token-extension-v${version}.zip`);
const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH || "1767225600");
const sourceDate = new Date(sourceDateEpoch * 1000);

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return nested.flat();
}

const dist = join(root, "dist");
const files = (await filesBelow(dist)).sort();
await Promise.all(files.map((path) => utimes(path, sourceDate, sourceDate)));
const archiveInput = `${files.map((path) => relative(dist, path)).join("\n")}\n`;

await new Promise((resolve, reject) => {
  const child = spawn("/usr/bin/zip", ["-X", "-q", output, "-@"], {
    cwd: dist,
    env: { ...process.env, TZ: "UTC" },
    stdio: ["pipe", "inherit", "inherit"],
  });
  child.stdin?.end(archiveInput);
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`zip exited with ${code}`)));
});

console.log(output);
