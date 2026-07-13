import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import { assertPublicId } from "./authenticity-contract.mjs";

const A4 = [595.28, 841.89];
const INK = rgb(0.055, 0.062, 0.067);
const MUTED = rgb(0.33, 0.35, 0.35);
const GREEN = rgb(10 / 255, 148 / 255, 70 / 255);
const GOLD = rgb(0.95, 0.66, 0);
const PALE = rgb(0.965, 0.972, 0.97);
const LINE = rgb(0.76, 0.79, 0.78);
const ICP_LOGO_PATH = fileURLToPath(new URL("../assets/icp-brasil-oficial.png", import.meta.url));
const ITI_POLICY_OID = "2.16.76.1.7.1.11.1.3";
const ITI_OPTIONAL_ATTRIBUTES = Object.freeze({
  incorporated: Object.freeze([
    "signerAttr", "/Name", "/M", "/Location", "/Reason", "/ContactInfo", "/Prop_Build",
  ]),
  actConditional: Object.freeze([
    "contentTimeStamp", "signatureTimeStampToken", "Document Time-stamp",
  ]),
  contextualOrDefault: Object.freeze([
    "/Reference", "/Changes", "/V=0", "/Prop_AuthTime", "DSS", "VRI",
  ]),
});
const SIGNATURE_BOX = Object.freeze({ left: 72, bottom: 52, width: 451, height: 92 });

function clean(value, fallback = "Não informado", max = 180) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g, "?")
    .slice(0, max);
}

function fitText(font, value, size, width) {
  const text = clean(value);
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}...`, size) > width) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function wrap(font, value, size, maxWidth, maxLines = 3) {
  const words = clean(value).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current === "") current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = fitText(font, lines[maxLines - 1], size, maxWidth);
  }
  return lines;
}

function drawLabelValue(page, fonts, label, value, x, y, width) {
  page.drawText(label, { x, y, font: fonts.bold, size: 6.8, color: MUTED });
  page.drawText(fitText(fonts.regular, value, 8.2, width), { x, y: y - 12, font: fonts.regular, size: 8.2, color: INK });
}

function drawAttributeSignal(page, fonts, { label, value, y, color }) {
  page.drawCircle({ x: 57, y: y + 2.2, size: 3.2, color });
  page.drawText(label, { x: 67, y, font: fonts.bold, size: 5.8, color: MUTED });
  page.drawText(fitText(fonts.regular, value, 6.1, 396), {
    x: 145, y, font: fonts.regular, size: 6.1, color: INK,
  });
}

function splitHash(value) {
  return value.match(/.{1,32}/g) || [];
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export async function inspectUnsignedPdf(pdf) {
  if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new TypeError("source PDF is invalid");
  if (/\/ByteRange\s*\[/i.test(pdf.toString("latin1"))) {
    throw Object.assign(new Error("source PDF already contains a digital signature"), { status: 409 });
  }
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  if (document.isEncrypted) throw Object.assign(new Error("encrypted PDF cannot be prepared"), { status: 422 });
  const pageCount = document.getPageCount();
  if (pageCount < 1) throw new TypeError("source PDF has no pages");
  return { pageCount };
}

export function buildEvidenceManifest({ publicId, documentNumber, documentName, sourceSha256, sourceSize, sourcePageCount, createdAt, documentContext, signingMetadata }) {
  return {
    schema: "https://assinatura.maiocchi.adv.br/schemas/pades-evidence-manifest-v1.json",
    version: "1.0.0",
    publicId: assertPublicId(publicId),
    documentNumber: clean(documentNumber, "", 64),
    source: {
      name: clean(documentName, "documento.pdf", 120),
      mediaType: "application/pdf",
      size: sourceSize,
      pageCount: sourcePageCount,
      sha256: sourceSha256,
    },
    createdAt: new Date(createdAt).toISOString(),
    generatedBy: {
      name: clean(documentContext?.generatedBy?.name, "Roger Maiocchi", 120),
      nationalIdMasked: clean(documentContext?.generatedBy?.nationalIdMasked, "006.***.***-40", 40),
      professionalRegistration: clean(documentContext?.generatedBy?.professionalRegistration, "OAB/DF 31.249", 40),
    },
    intendedFor: clean(documentContext?.intendedFor),
    purpose: clean(documentContext?.purpose, "Documento eletrônico"),
    signingEnvironment: {
      observedIp: clean(signingMetadata?.observedIp, "Não fornecido", 80),
      platform: clean(signingMetadata?.platform, "Não fornecida", 120),
      userAgent: clean(signingMetadata?.userAgent, "Não fornecido", 300),
      timezone: clean(signingMetadata?.timezone, "Não fornecido", 80),
      locale: clean(signingMetadata?.locale, "Não fornecido", 40),
      geolocation: signingMetadata?.geolocation ? {
        latitude: Number(signingMetadata.geolocation.latitude.toFixed(5)),
        longitude: Number(signingMetadata.geolocation.longitude.toFixed(5)),
        accuracyMeters: Math.round(signingMetadata.geolocation.accuracyMeters),
      } : null,
      capturedAt: new Date(signingMetadata?.capturedAt || createdAt).toISOString(),
    },
    signature: {
      format: "PAdES",
      infrastructure: "ICP-Brasil",
      profile: "AD-RB",
      policyOid: ITI_POLICY_OID,
      tokenType: clean(signingMetadata?.tokenType, "Certificado ICP-Brasil A3", 100),
      signerIdentitySource: "certificado-digital",
      optionalAttributes: {
        normativeDocument: "DOC-ICP-15.03 v9.1",
        assurance: signingMetadata?.modality === "remote" ? "psc-final-validation" : "private-provider-enforced",
        incorporated: [...ITI_OPTIONAL_ATTRIBUTES.incorporated],
        actConditional: [...ITI_OPTIONAL_ATTRIBUTES.actConditional],
        contextualOrDefault: [...ITI_OPTIONAL_ATTRIBUTES.contextualOrDefault],
      },
    },
  };
}

export async function composePadesEvidence({ sourcePdf, manifest, attestation, baseUrl = "https://assinatura.maiocchi.adv.br" }) {
  const verificationUrl = new URL(`/validar/?codigo=${encodeURIComponent(manifest.publicId)}`, baseUrl).toString();
  const document = await PDFDocument.load(sourcePdf, { updateMetadata: false });
  const fonts = {
    regular: await document.embedFont(StandardFonts.Helvetica),
    bold: await document.embedFont(StandardFonts.HelveticaBold),
    mono: await document.embedFont(StandardFonts.Courier),
  };
  const icpLogo = await document.embedPng(await readFile(ICP_LOGO_PATH));
  const qr = await document.embedPng(await QRCode.toBuffer(verificationUrl, {
    type: "png", width: 420, margin: 1, errorCorrectionLevel: "M",
  }));
  const barcodeValue = `${manifest.publicId}|${manifest.documentNumber}`;
  const barcode = await document.embedPng(await bwipjs.toBuffer({
    bcid: "code128", text: barcodeValue, scale: 3, height: 12, includetext: false,
    paddingwidth: 0, paddingheight: 0,
  }));

  const originalPages = document.getPages();
  const totalPages = originalPages.length + 1;
  const drawFooter = (page, index) => {
    const width = page.getWidth();
    page.drawRectangle({ x: 0, y: 0, width, height: 24, color: rgb(1, 1, 1), opacity: 0.93 });
    page.drawLine({ start: { x: 24, y: 24 }, end: { x: width - 24, y: 24 }, thickness: 0.35, color: LINE, opacity: 0.7 });
    page.drawText("m.", { x: 24, y: 8.5, font: fonts.bold, size: 8.5, color: INK, opacity: 0.78 });
    const middle = `${manifest.publicId} · PAdES AD-RB · ITI · assinatura.maiocchi.adv.br`;
    page.drawText(fitText(fonts.regular, middle, 6.2, Math.max(80, width - 125)), {
      x: 43, y: 9.4, font: fonts.regular, size: 6.2, color: MUTED, opacity: 0.78,
    });
    const count = `${index + 1}/${totalPages}`;
    page.drawText(count, { x: width - 24 - fonts.mono.widthOfTextAtSize(count, 6.2), y: 9.4, font: fonts.mono, size: 6.2, color: MUTED });
  };
  originalPages.forEach(drawFooter);

  const page = document.addPage(A4);
  page.drawRectangle({ x: 0, y: A4[1] - 9, width: A4[0], height: 9, color: GOLD });
  page.drawText("m.", { x: 42, y: 775, font: fonts.bold, size: 28, color: INK });
  page.drawText("MAIOCCHI ADVOGADO", { x: 86, y: 790, font: fonts.bold, size: 8.4, color: INK });
  page.drawText("EVIDÊNCIAS DA ASSINATURA DIGITAL", { x: 86, y: 776, font: fonts.regular, size: 7.6, color: MUTED });
  page.drawImage(icpLogo, { x: 417, y: 770, width: 132, height: 44.55 });

  page.drawText("Documento eletrônico assinado", { x: 42, y: 731, font: fonts.bold, size: 20, color: INK });
  wrap(fonts.regular,
    "A assinatura PAdES e o arquivo eletrônico constituem o original. Esta página consolida dados de conferência; elementos visuais não substituem a validação criptográfica.",
    9, 505, 2).forEach((line, index) => page.drawText(line, { x: 42, y: 710 - index * 12, font: fonts.regular, size: 9, color: MUTED }));

  page.drawRectangle({ x: 42, y: 619, width: 511, height: 62, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  drawLabelValue(page, fonts, "CÓDIGO DE VERIFICAÇÃO", manifest.publicId, 54, 662, 270);
  drawLabelValue(page, fonts, "NÚMERO DO DOCUMENTO", manifest.documentNumber, 322, 662, 218);
  drawLabelValue(page, fonts, "ARQUIVO", manifest.source.name, 54, 637, 270);
  drawLabelValue(page, fonts, "PÁGINAS", `${totalPages} (${manifest.source.pageCount} originais + 1 evidência)`, 322, 637, 218);

  page.drawText("HASH SHA-256 DO CONTEÚDO RECEBIDO", { x: 54, y: 598, font: fonts.bold, size: 7, color: MUTED });
  splitHash(manifest.source.sha256).forEach((line, index) => page.drawText(line, {
    x: 54, y: 581 - index * 12, font: fonts.mono, size: 8.7, color: INK,
  }));
  page.drawText("O hash binário do PDF final PAdES é calculado após a assinatura e exibido no portal.", {
    x: 54, y: 553, font: fonts.regular, size: 7.2, color: MUTED,
  });

  page.drawLine({ start: { x: 42, y: 536 }, end: { x: 553, y: 536 }, thickness: 0.6, color: LINE });
  page.drawText("IDENTIFICAÇÃO E CONTEXTO", { x: 42, y: 519, font: fonts.bold, size: 7.2, color: MUTED });
  drawLabelValue(page, fonts, "GERADO POR", `${manifest.generatedBy.name} · CPF ${manifest.generatedBy.nationalIdMasked} · ${manifest.generatedBy.professionalRegistration}`, 54, 497, 485);
  drawLabelValue(page, fonts, "DESTINADO A", manifest.intendedFor, 54, 469, 235);
  drawLabelValue(page, fonts, "FINALIDADE", manifest.purpose, 304, 469, 235);
  drawLabelValue(page, fonts, "DATA/HORA DE PREPARAÇÃO", `${formatDate(manifest.createdAt)} · America/Sao_Paulo`, 54, 441, 235);
  drawLabelValue(page, fonts, "TIPO", `${manifest.signature.format} ${manifest.signature.profile} · ${manifest.signature.infrastructure}`, 304, 441, 235);
  drawLabelValue(page, fonts, "TOKEN / MODALIDADE", manifest.signature.tokenType, 54, 413, 235);
  drawLabelValue(page, fonts, "IP OBSERVADO", manifest.signingEnvironment.observedIp, 304, 413, 235);
  drawLabelValue(page, fonts, "MÁQUINA / PLATAFORMA", manifest.signingEnvironment.platform, 54, 385, 235);
  const location = manifest.signingEnvironment.geolocation
    ? `${manifest.signingEnvironment.geolocation.latitude}, ${manifest.signingEnvironment.geolocation.longitude} (±${manifest.signingEnvironment.geolocation.accuracyMeters} m)`
    : "Não fornecida pelo usuário";
  drawLabelValue(page, fonts, "LOCALIZAÇÃO", location, 304, 385, 235);
  drawLabelValue(page, fonts, "AMBIENTE", `${manifest.signingEnvironment.userAgent} · ${manifest.signingEnvironment.timezone}`, 54, 357, 485);

  const optionalAttributes = manifest.signature.optionalAttributes;
  page.drawRectangle({ x: 42, y: 274, width: 511, height: 64, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  page.drawText("SINAIS FÍSICOS DOS ATRIBUTOS OPCIONAIS ITI", { x: 54, y: 325, font: fonts.bold, size: 6.8, color: MUTED });
  page.drawText(`${optionalAttributes.normativeDocument} · AD-RB v1.3 · OID ${manifest.signature.policyOid}`, {
    x: 293, y: 325, font: fonts.mono, size: 5.5, color: MUTED,
  });
  drawAttributeSignal(page, fonts, {
    label: optionalAttributes.assurance === "private-provider-enforced" ? "INCORPORADOS" : "PSC / CONFERIR",
    value: optionalAttributes.incorporated.join(" · "), y: 309, color: GREEN,
  });
  drawAttributeSignal(page, fonts, {
    label: "ACT / CONDICIONAL", value: optionalAttributes.actConditional.join(" · "), y: 295, color: GOLD,
  });
  drawAttributeSignal(page, fonts, {
    label: "CONTEXTO / PADRÃO", value: optionalAttributes.contextualOrDefault.join(" · "), y: 281, color: MUTED,
  });

  page.drawRectangle({ x: 42, y: 222, width: 326, height: 44, color: PALE, borderColor: LINE, borderWidth: 0.5 });
  page.drawText("ATESTADO PÓS-QUÂNTICO DO MANIFESTO", { x: 54, y: 253, font: fonts.bold, size: 6.7, color: MUTED });
  page.drawText(attestation.code, { x: 54, y: 238, font: fonts.mono, size: 7.6, color: INK });
  page.drawText(`ML-DSA-65 · chave ${attestation.keyId}`, { x: 54, y: 226, font: fonts.regular, size: 6.5, color: MUTED });
  page.drawImage(qr, { x: 474, y: 190, width: 76, height: 76 });
  page.drawImage(barcode, { x: 42, y: 187, width: 326, height: 25 });
  page.drawText(barcodeValue, { x: 42, y: 177, font: fonts.mono, size: 5.9, color: MUTED });
  page.drawText("VALIDAR", { x: 382, y: 254, font: fonts.bold, size: 6.4, color: MUTED });
  (verificationUrl.match(/.{1,18}/g) || []).slice(0, 4).forEach((line, index) => page.drawText(line, {
    x: 382, y: 242 - index * 8, font: fonts.mono, size: 5.2, color: INK,
  }));

  page.drawLine({ start: { x: 42, y: 166 }, end: { x: 553, y: 166 }, thickness: 0.6, color: LINE });
  page.drawText("SIGNATÁRIO E ATRIBUTOS CONFIRMADOS NO PAdES", { x: 72, y: 151, font: fonts.bold, size: 7.2, color: GREEN });
  page.drawRectangle({ x: SIGNATURE_BOX.left, y: SIGNATURE_BOX.bottom, width: SIGNATURE_BOX.width, height: SIGNATURE_BOX.height, borderColor: LINE, borderWidth: 0.55 });
  page.drawText("A identificação, o CPF mascarado e o instante da assinatura serão inseridos neste campo pelo provider PAdES.", {
    x: 84, y: 76, font: fonts.regular, size: 7.2, color: MUTED,
  });
  page.drawText("Base jurídica: MP 2.200-2/2001, art. 10, §1º; Lei 14.063/2020, art. 4º, III. Validação oficial: validar.iti.gov.br.", {
    x: 42, y: 32, font: fonts.regular, size: 6.2, color: MUTED,
  });
  drawFooter(page, totalPages - 1);

  document.setTitle(manifest.source.name.replace(/\.pdf$/i, ""));
  document.setAuthor("Maiocchi Advogado");
  document.setSubject(`Documento PAdES ICP-Brasil · ${manifest.publicId}`);
  document.setCreator("Maiocchi Assinatura");
  document.setProducer("Maiocchi Assinatura");
  document.setKeywords(["PAdES", "ICP-Brasil", manifest.publicId, manifest.documentNumber, attestation.code]);
  document.setCreationDate(new Date(manifest.createdAt));
  document.setModificationDate(new Date(manifest.createdAt));

  const presentation = Buffer.from(await document.save({ useObjectStreams: false, addDefaultPage: false }));
  const sheetDocument = await PDFDocument.create();
  const [copied] = await sheetDocument.copyPages(document, [document.getPageCount() - 1]);
  sheetDocument.addPage(copied);
  const evidencePage = Buffer.from(await sheetDocument.save({ useObjectStreams: false, addDefaultPage: false }));
  return { presentation, evidencePage, totalPages, verificationUrl, barcodeValue, signatureBox: SIGNATURE_BOX };
}

export { SIGNATURE_BOX };
