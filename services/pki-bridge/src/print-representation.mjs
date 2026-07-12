import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { assertPublicId } from "./authenticity-contract.mjs";

const A4 = [595.28, 841.89];
const INK = rgb(0.04, 0.04, 0.04);
const MUTED = rgb(0.28, 0.28, 0.26);
const GOLD = rgb(0.95, 0.66, 0);

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

export async function createAuthenticitySheet({ publicId, originalSha256, revision, finalizedAt, verifyUrl }) {
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

  page.drawText("Representação de documento eletrônico", { x: 72, y: 690, font: timesBold, size: 22, color: INK });
  let cursor = drawWrapped(page,
    "Esta folha não substitui o PDF eletrônico assinado. O valor criptográfico e a validação pertencem ao arquivo PAdES original; confira a correspondência pelo código, pelo hash SHA-256 e pelo endereço abaixo.",
    { x: 72, y: 655, font: times, size: 12, maxWidth: 450, lineHeight: 18, color: MUTED });

  cursor -= 30;
  page.drawText("ID DO DOCUMENTO", { x: 72, y: cursor, font: timesBold, size: 9, color: MUTED });
  page.drawText(id, { x: 72, y: cursor - 24, font: mono, size: 14, color: INK });
  page.drawText(`VERSÃO ${revision}`, { x: 420, y: cursor - 24, font: timesBold, size: 10, color: INK });

  cursor -= 70;
  page.drawText("HASH SHA-256 DO PDF ASSINADO", { x: 72, y: cursor, font: timesBold, size: 9, color: MUTED });
  splitHash(originalSha256).forEach((line, index) => {
    page.drawText(line, { x: 72, y: cursor - 24 - index * 17, font: mono, size: 11, color: INK });
  });

  const qrSize = 136;
  page.drawImage(qrImage, { x: 72, y: 190, width: qrSize, height: qrSize });
  page.drawText("VERIFICAÇÃO", { x: 236, y: 310, font: timesBold, size: 9, color: MUTED });
  drawWrapped(page, verificationUrl.toString(), { x: 236, y: 286, font: mono, size: 9, maxWidth: 285, lineHeight: 14, color: INK });
  page.drawText("VALIDADOR OFICIAL", { x: 236, y: 236, font: timesBold, size: 9, color: MUTED });
  page.drawText("https://validar.iti.gov.br/", { x: 236, y: 214, font: mono, size: 9, color: INK });

  page.drawLine({ start: { x: 72, y: 150 }, end: { x: 523, y: 150 }, thickness: 0.8, color: rgb(0.75, 0.75, 0.72) });
  page.drawText(`Finalizado em ${finalizedDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: 72, y: 125, font: times, size: 9, color: MUTED });
  page.drawText("Página 1 de 1", { x: 458, y: 72, font: times, size: 9, color: MUTED });
  page.drawText("Maiocchi Advogado · Roger Maiocchi · OAB/DF 31.249", { x: 72, y: 72, font: times, size: 9, color: MUTED });

  return Buffer.from(await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
}
