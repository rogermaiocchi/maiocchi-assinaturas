import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const editorDirectory = path.resolve(scriptDirectory, "..");
const requireFromBridge = createRequire(new URL("../../../services/pki-bridge/package.json", import.meta.url));
const QRCode = requireFromBridge("qrcode");
const bwipjs = requireFromBridge("bwip-js");

const publicId = "MAI-2026-ESY0-6MPD-QQBP-RMG4";
const verificationUrl = `https://assinatura.maiocchi.adv.br/validar?codigo=${publicId}`;
const barcodeValue = `MAI|${publicId}|R1`;
const outputDirectory = path.join(editorDirectory, "public", "assets");

await fs.mkdir(outputDirectory, { recursive: true });

const [qr, barcode] = await Promise.all([
  QRCode.toBuffer(verificationUrl, {
    type: "png",
    width: 600,
    margin: 4,
    errorCorrectionLevel: "H",
  }),
  bwipjs.toBuffer({
    bcid: "code128",
    text: barcodeValue,
    scale: 4,
    height: 14,
    includetext: false,
    paddingwidth: 8,
    paddingheight: 0,
  }),
]);

await Promise.all([
  fs.writeFile(path.join(outputDirectory, "verification-qr.png"), qr),
  fs.writeFile(path.join(outputDirectory, "verification-barcode.png"), barcode),
]);

console.log(`QR: ${verificationUrl}`);
console.log(`Code 128: ${barcodeValue}`);
