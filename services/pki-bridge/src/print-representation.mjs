import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import { assertPublicId } from "./authenticity-contract.mjs";

const A4 = [595.28, 841.89];
const INK = rgb(0.04, 0.04, 0.04);
const MUTED = rgb(0.28, 0.28, 0.26);
const GOLD = rgb(0.95, 0.66, 0);
const PALE = rgb(0.96, 0.97, 0.97);
const LINE = rgb(0.78, 0.81, 0.8);

function splitHash(value) {
  return value.match(/.{1,16}/g) || [];
}

function drawWrapped(page, text, { x, y, font, size, maxWidth, lineHeight, color = INK }) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current === "") current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  lines.forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, font, size, color }));
  return y - lines.length * lineHeight;
}

function display(value, fallback = "Não informado") {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : fallback;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return display(value);
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function metadataFrom(documentContext, signatures, signatureType) {
  const context = documentContext && typeof documentContext === "object" && !Array.isArray(documentContext) ? documentContext : {};
  const firstSigner = Array.isArray(context.signers) && context.signers[0] ? context.signers[0] : {};
  const firstSignature = Array.isArray(signatures) && signatures[0] ? signatures[0] : {};
  return {
    intendedFor: display(context.intendedFor),
    purpose: display(context.purpose, "Documento eletrônico"),
    signingLocation: display(context.signingLocation),
    tokenType: display(context.tokenType),
    signerName: display(firstSigner.name ?? firstSignature.signerName),
    signerRole: display(firstSigner.role, "Signatário"),
    signedAt: firstSignature.signingTime ? formatTimestamp(firstSignature.signingTime) : "Não informado",
    signatureType: display(signatureType, "PAdES ICP-Brasil"),
  };
}

export async function createAuthenticitySheet({ publicId, originalSha256, revision, finalizedAt, verifyUrl, documentContext, signatures, signatureType }) {
  const id = assertPublicId(publicId);
  if (!/^[a-f0-9]{64}$/.test(originalSha256 || "")) throw new TypeError("original SHA-256 is invalid");
  if (!Number.isSafeInteger(revision) || revision <= 0) throw new TypeError("revision is invalid");
  const finalizedDate = new Date(finalizedAt);
  if (Number.isNaN(finalizedDate.getTime()) || finalizedDate.toISOString() !== finalizedAt) throw new TypeError("finalizedAt is invalid");
  const verificationUrl = new URL(verifyUrl);
  if (verificationUrl.protocol !== "https:" || verificationUrl.username || verificationUrl.password) throw new TypeError("verification URL must use HTTPS");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(A4);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const qr = await QRCode.toBuffer(verificationUrl.toString(), { type: "png", width: 512, margin: 1, errorCorrectionLevel: "M" });
  const qrImage = await pdf.embedPng(qr);
  const barcodeValue = `MAI|${id}|R${revision}`;
  const barcode = await bwipjs.toBuffer({ bcid: "code128", text: barcodeValue, scale: 3, height: 14, includetext: false, paddingwidth: 0, paddingheight: 0 });
  const barcodeImage = await pdf.embedPng(barcode);
  const metadata = metadataFrom(documentContext, signatures, signatureType);

  pdf.setTitle(`Folha de autenticidade ${id}`);
  pdf.setAuthor("Maiocchi Advogado");
  pdf.setSubject("Representação impressa de documento eletrônico");
  pdf.setCreator("Maiocchi Assinaturas");
  pdf.setProducer("Maiocchi Assinaturas");
  pdf.setCreationDate(finalizedDate);
  pdf.setModificationDate(finalizedDate);

  page.drawRectangle({ x: 0, y: A4[1] - 18, width: A4[0], height: 18, color: GOLD });
  page.drawText("m.", { x: 72, y: 754, font: timesBold, size: 30, color: INK });
  page.drawText("MAIOCCHI ADVOGADO", { x: 112, y: 767, font: timesBold, size: 10, color: INK });
  page.drawText("FOLHA DE AUTENTICIDADE", { x: 112, y: 750, font: times, size: 9, color: MUTED });
  const signatureProfile = metadata.signatureType.replace(/^PAdES\s+/i, "").replace(/\s+-\s+ICP-Brasil$/i, "");
  page.drawText(`PAdES · ICP-BRASIL · ${signatureProfile}`, { x: 337, y: 758, font: timesBold, size: 7.5, color: MUTED });

  page.drawText("Representação de documento eletrônico", { x: 72, y: 690, font: timesBold, size: 22, color: INK });
  let cursor = drawWrapped(page,
    "Esta folha não substitui o PDF eletrônico assinado. O valor criptográfico e a validação pertencem ao arquivo PAdES original; confira a correspondência pelo código, pelo hash SHA-256 e pelo endereço abaixo.",
    { x: 72, y: 655, font: times, size: 12, maxWidth: 450, lineHeight: 18, color: MUTED });

  cursor -= 30;
  page.drawRectangle({ x: 62, y: cursor - 42, width: 471, height: 54, color: PALE, borderColor: LINE, borderWidth: 0.6 });
  page.drawText("ID DO DOCUMENTO", { x: 72, y: cursor, font: timesBold, size: 9, color: MUTED });
  page.drawText(id, { x: 72, y: cursor - 24, font: mono, size: 14, color: INK });
  page.drawText(`VERSÃO ${revision}`, { x: 420, y: cursor - 24, font: timesBold, size: 10, color: INK });

  cursor -= 70;
  page.drawRectangle({ x: 62, y: cursor - 83, width: 471, height: 96, color: PALE, borderColor: LINE, borderWidth: 0.6 });
  page.drawText("HASH SHA-256 DO PDF ASSINADO", { x: 72, y: cursor, font: timesBold, size: 9, color: MUTED });
  splitHash(originalSha256).forEach((line, index) => {
    page.drawText(line, { x: 72, y: cursor - 24 - index * 17, font: mono, size: 11, color: INK });
  });

  cursor -= 108;
  page.drawText("METADADOS DA ASSINATURA", { x: 72, y: cursor, font: timesBold, size: 9, color: MUTED });
  const details = [
    ["DESTINADO A", metadata.intendedFor],
    ["FINALIDADE", metadata.purpose],
    ["ASSINANTE", `${metadata.signerName} · ${metadata.signerRole}`],
    ["DATA/HORA DA ASSINATURA", metadata.signedAt],
    ["LOCAL DECLARADO", metadata.signingLocation],
    ["TOKEN", metadata.tokenType],
    ["TIPO", metadata.signatureType],
  ];
  details.forEach(([label, value], index) => {
    const y = cursor - 21 - index * 17;
    page.drawText(label, { x: 72, y, font: timesBold, size: 7.5, color: MUTED });
    page.drawText(value.slice(0, 90), { x: 192, y, font: times, size: 8.5, color: INK });
  });

  const qrSize = 100;
  page.drawRectangle({ x: 62, y: 126, width: 120, height: 116, color: PALE, borderColor: LINE, borderWidth: 0.6 });
  page.drawImage(qrImage, { x: 72, y: 134, width: qrSize, height: qrSize });
  page.drawText("APONTE A CÂMERA", { x: 73, y: 128, font: timesBold, size: 6.5, color: MUTED });
  page.drawRectangle({ x: 192, y: 82, width: 341, height: 160, color: PALE, borderColor: LINE, borderWidth: 0.6 });
  page.drawText("QR DE VERIFICAÇÃO", { x: 204, y: 222, font: timesBold, size: 9, color: MUTED });
  drawWrapped(page, verificationUrl.toString(), { x: 204, y: 202, font: mono, size: 7.5, maxWidth: 315, lineHeight: 11, color: INK });
  page.drawText("CÓDIGO DE BARRAS", { x: 204, y: 166, font: timesBold, size: 9, color: MUTED });
  page.drawImage(barcodeImage, { x: 204, y: 120, width: 315, height: 36 });
  page.drawText(barcodeValue, { x: 204, y: 106, font: mono, size: 7, color: MUTED });
  page.drawText("CONFERÊNCIA INDEPENDENTE: https://validar.iti.gov.br/", { x: 204, y: 90, font: mono, size: 7, color: INK });

  page.drawLine({ start: { x: 72, y: 72 }, end: { x: 523, y: 72 }, thickness: 0.8, color: rgb(0.75, 0.75, 0.72) });
  page.drawText(`Finalizado em ${finalizedDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: 72, y: 50, font: times, size: 8, color: MUTED });
  page.drawText("Página 1 de 1", { x: 458, y: 50, font: times, size: 8, color: MUTED });
  page.drawText("Maiocchi Advogado · Roger Maiocchi · OAB/DF 31.249", { x: 72, y: 33, font: times, size: 8, color: MUTED });

  return Buffer.from(await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
}
