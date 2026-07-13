import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const editorDirectory = path.resolve(scriptDirectory, "..");
const sourceSvgPath = path.join(editorDirectory, "assets", "pades-security-seal-background.svg");
const publicSvgPath = path.join(editorDirectory, "public", "assets", "pades-security-seal-background.svg");
const outputPath = path.join(editorDirectory, "public", "assets", "pades-security-seal-4k.png");
const rendererOutputPath = path.resolve(editorDirectory, "../../services/pki-bridge/assets/pades-security-seal.png");
const icpLogoPath = path.join(editorDirectory, "public", "assets", "icp-brasil-oficial.png");
const previewPath = path.join(editorDirectory, "output", "pades-security-seal-composite.png");

const canvas = { width: 4096, height: 835 };

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buildPreviewOverlay() {
  const lines = [
    { x: 270, y: 246, size: 49, weight: 900, color: "#006b36", spacing: 4, text: "ASSINATURA DIGITAL ICP-BRASIL · PADES AD-RB" },
    { x: 270, y: 350, size: 76, weight: 900, color: "#111210", spacing: 1, text: "ROGER MAIOCCHI" },
    { x: 270, y: 429, size: 40, weight: 760, color: "#111210", spacing: 0, text: "CPF 006.***.***-40 · 13/07/2026 15:57:40 UTC" },
    { x: 270, y: 501, size: 35, weight: 700, color: "#303630", spacing: 0, text: "Certificado A3 · atributos incorporados · confira pelo QR ou código" },
  ];

  const text = lines.map((line) => (
    `<text x="${line.x}" y="${line.y}" fill="${line.color}" font-family="Arial,Helvetica,sans-serif" `
      + `font-size="${line.size}" font-weight="${line.weight}" letter-spacing="${line.spacing}">${escapeXml(line.text)}</text>`
  )).join("\n");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
      ${text}
      <rect x="260" y="539" width="2510" height="65" rx="7" fill="#fff" fill-opacity=".82"/>
      <text x="280" y="585" fill="#20251f" font-family="Courier New,monospace" font-size="31" font-weight="700" letter-spacing="5">FPR 020996E7 AA6CF44F 59AEFD21 DF96CA39</text>
    </svg>
  `);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(previewPath), { recursive: true });

const sourceSvg = await fs.readFile(sourceSvgPath, "utf8");
const background = await sharp(Buffer.from(sourceSvg), { density: 288 })
  .resize(canvas.width, canvas.height, { fit: "fill" })
  .png({ compressionLevel: 9 })
  .toBuffer();
const previewIcpLogo = await sharp(await fs.readFile(icpLogoPath))
  .resize({ width: 680 })
  .png({ compressionLevel: 9 })
  .toBuffer();

await Promise.all([
  fs.writeFile(outputPath, background),
  fs.writeFile(rendererOutputPath, background),
  fs.copyFile(sourceSvgPath, publicSvgPath),
  sharp(background)
    .composite([
      { input: buildPreviewOverlay(), left: 0, top: 0 },
      { input: previewIcpLogo, left: 3268, top: 303 },
    ])
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toFile(previewPath),
]);

console.log(`Security seal generated: ${canvas.width}x${canvas.height}`);
console.log(outputPath);
console.log(previewPath);
