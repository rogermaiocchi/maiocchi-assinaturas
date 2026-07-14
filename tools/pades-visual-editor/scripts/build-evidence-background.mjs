import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const editorDirectory = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(editorDirectory, "assets", "pades-evidence-page-background.svg");
const publicSvgPath = path.join(editorDirectory, "public", "assets", "pades-evidence-page-background.svg");
const publicPngPath = path.join(editorDirectory, "public", "assets", "pades-evidence-page-300dpi.png");
const rendererPngPath = path.resolve(editorDirectory, "../../services/pki-bridge/assets/pades-evidence-page.png");
const previewPath = path.join(editorDirectory, "output", "pades-evidence-page-background.png");

const canvas = Object.freeze({ width: 2480, height: 3508 });

function wavePath({ y, amplitude, cycles, phase = 0, steps = 112 }) {
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const x = (canvas.width / steps) * index;
    const angle = (index / steps) * Math.PI * 2 * cycles + phase;
    const secondary = Math.sin(angle * 0.47 + phase * 1.7) * amplitude * 0.22;
    points.push(`${index === 0 ? "M" : "L"}${x.toFixed(1)} ${(y + Math.sin(angle) * amplitude + secondary).toFixed(1)}`);
  }
  return points.join(" ");
}

function waveFamily({ y, amplitude, cycles, phase, color, opacity, count = 7, gap = 15 }) {
  return Array.from({ length: count }, (_, index) => {
    const offset = (index - (count - 1) / 2) * gap;
    const path = wavePath({
      y: y + offset,
      amplitude: amplitude + index * 3,
      cycles,
      phase: phase + index * 0.08,
    });
    return `<path d="${path}" stroke="${color}" stroke-width="2.3" stroke-opacity="${opacity}"/>`;
  }).join("\n");
}

function rosette({ x, y, radius, color, opacity, petals = 12, ratio = 0.38 }) {
  const ellipses = Array.from({ length: petals }, (_, index) => (
    `<ellipse rx="${radius}" ry="${(radius * ratio).toFixed(1)}" transform="rotate(${(180 / petals) * index})"/>`
  )).join("\n");
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-opacity="${opacity}">
      <circle r="${radius * 1.08}" stroke-width="3.2" stroke-dasharray="10 18"/>
      <circle r="${radius * 0.86}" stroke-width="2.2" stroke-dasharray="6 13"/>
      <g stroke-width="2.6">${ellipses}</g>
    </g>`;
}

function buildSvg() {
  const waves = [
    waveFamily({ y: 710, amplitude: 250, cycles: 2.1, phase: 0.2, color: "#087b61", opacity: 0.13 }),
    waveFamily({ y: 1330, amplitude: 330, cycles: 1.65, phase: 1.2, color: "#2d5aa7", opacity: 0.085, count: 6, gap: 18 }),
    waveFamily({ y: 2050, amplitude: 290, cycles: 2.35, phase: 2.1, color: "#d59700", opacity: 0.105, count: 5, gap: 17 }),
    waveFamily({ y: 2860, amplitude: 360, cycles: 1.8, phase: 0.7, color: "#087b61", opacity: 0.11, count: 8, gap: 14 }),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" role="img" aria-labelledby="title desc">
  <title id="title">Fundo integral de segurança visual da folha de evidências Maiocchi</title>
  <desc id="desc">Guilloché em linguagem de passaporte com rosetas, microtexto e contornos das marcas m. e MAIOCCHI.</desc>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1f9f5"/>
      <stop offset=".38" stop-color="#ffffff"/>
      <stop offset=".68" stop-color="#fbfcff"/>
      <stop offset="1" stop-color="#edf2fb"/>
    </linearGradient>
    <radialGradient id="mintHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#cbe9dd" stop-opacity=".58"/>
      <stop offset="1" stop-color="#cbe9dd" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="blueHalo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#dce5f8" stop-opacity=".58"/>
      <stop offset="1" stop-color="#dce5f8" stop-opacity="0"/>
    </radialGradient>
    <pattern id="microgrid" width="74" height="74" patternUnits="userSpaceOnUse">
      <path d="M0 37h74M37 0v74" fill="none" stroke="#087b61" stroke-width="1" stroke-opacity=".055"/>
      <circle cx="37" cy="37" r="17" fill="none" stroke="#2d5aa7" stroke-width="1" stroke-opacity=".045"/>
      <circle cx="37" cy="37" r="2.5" fill="#e1a000" fill-opacity=".11"/>
    </pattern>
    <pattern id="microtext" width="930" height="38" patternUnits="userSpaceOnUse">
      <text x="0" y="27" fill="#16312a" fill-opacity=".34" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700" letter-spacing="4">MAIOCCHI • M. • PADES • AUTENTICIDADE • EVIDÊNCIA • </text>
    </pattern>
    <clipPath id="pageClip"><rect width="${canvas.width}" height="${canvas.height}"/></clipPath>
  </defs>

  <rect width="${canvas.width}" height="${canvas.height}" fill="url(#paper)"/>
  <rect width="${canvas.width}" height="${canvas.height}" fill="url(#microgrid)"/>
  <circle cx="2050" cy="620" r="690" fill="url(#blueHalo)"/>
  <circle cx="360" cy="2890" r="760" fill="url(#mintHalo)"/>

  <g clip-path="url(#pageClip)" fill="none">${waves}</g>

  ${rosette({ x: 2070, y: 610, radius: 410, color: "#2d5aa7", opacity: 0.17, petals: 14 })}
  ${rosette({ x: 365, y: 2865, radius: 470, color: "#087b61", opacity: 0.16, petals: 16, ratio: 0.34 })}
  ${rosette({ x: 2250, y: 2910, radius: 250, color: "#d59700", opacity: 0.12, petals: 11, ratio: 0.42 })}

  <g fill="none" font-family="Arial Black,Arial,Helvetica,sans-serif" font-weight="900">
    <text x="-90" y="1460" font-size="1120" stroke="#087b61" stroke-width="7" stroke-opacity=".075">m</text>
    <circle cx="748" cy="1306" r="82" stroke="#d59700" stroke-width="8" stroke-opacity=".13"/>
    <text x="245" y="3200" font-size="430" stroke="#2d5aa7" stroke-width="5" stroke-opacity=".052">MAIOCCHI</text>
    <circle cx="2245" cy="3024" r="38" stroke="#d59700" stroke-width="6" stroke-opacity=".14"/>
    <text x="1660" y="1840" font-size="580" stroke="#087b61" stroke-width="4" stroke-opacity=".04" transform="rotate(-10 1660 1840)">m</text>
    <circle cx="2178" cy="1737" r="46" stroke="#d59700" stroke-width="5" stroke-opacity=".1"/>
  </g>

  <rect x="112" y="112" width="2256" height="38" fill="url(#microtext)" opacity=".7"/>
  <rect x="112" y="3358" width="2256" height="38" fill="url(#microtext)" opacity=".7" transform="rotate(180 1240 3377)"/>

  <g font-family="Arial,Helvetica,sans-serif" font-weight="700" fill="#17352d" fill-opacity=".09">
    <text x="176" y="205" font-size="25" letter-spacing="8">MAIOCCHI · DOCUMENT SECURITY GRAPHIC · PADES · VERIFICAÇÃO</text>
    <text x="176" y="3320" font-size="22" letter-spacing="7">O ORIGINAL É O PDF ASSINADO · CONFIRA QR · HASH · CÓDIGO</text>
  </g>
</svg>`;
}

await Promise.all([
  fs.mkdir(path.dirname(sourcePath), { recursive: true }),
  fs.mkdir(path.dirname(publicPngPath), { recursive: true }),
  fs.mkdir(path.dirname(rendererPngPath), { recursive: true }),
  fs.mkdir(path.dirname(previewPath), { recursive: true }),
]);

const sourceSvg = buildSvg();
const png = await sharp(Buffer.from(sourceSvg), { density: 300 })
  .resize(canvas.width, canvas.height, { fit: "fill" })
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

await Promise.all([
  fs.writeFile(sourcePath, sourceSvg),
  fs.writeFile(publicSvgPath, sourceSvg),
  fs.writeFile(publicPngPath, png),
  fs.writeFile(rendererPngPath, png),
  fs.writeFile(previewPath, png),
]);

console.log(`Evidence background generated: ${canvas.width}x${canvas.height} (A4 300 dpi)`);
console.log(publicPngPath);
console.log(rendererPngPath);
