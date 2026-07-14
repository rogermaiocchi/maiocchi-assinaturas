import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, degrees, rgb } from "pdf-lib";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import { assertPublicId, portalVerificationUrl } from "./authenticity-contract.mjs";
import {
  A4,
  BODY,
  EVIDENCE_BLOCKS,
  PAGE_CHROME,
  PAGE_MARGINS,
  SIGNATURE_BOX,
  SIGNATURE_FRAME,
  TYPOGRAPHY,
  pdfY,
} from "./pades-evidence-layout.mjs";

const INK = rgb(0.055, 0.062, 0.067);
const MUTED = rgb(0.33, 0.35, 0.35);
const GREEN = rgb(0, 107 / 255, 54 / 255);
const GOLD = rgb(0.95, 0.66, 0);
const BLUE = rgb(23 / 255, 74 / 255, 126 / 255);
const PALE = rgb(0.965, 0.972, 0.97);
const LINE = rgb(0.76, 0.79, 0.78);
const ICP_LOGO_PATH = fileURLToPath(new URL("../assets/icp-brasil-oficial.png", import.meta.url));
const MAIOCCHI_MARK_PATH = fileURLToPath(new URL("../assets/maiocchi-mark.png", import.meta.url));
const SECURITY_SEAL_PATH = fileURLToPath(new URL("../assets/pades-security-seal.png", import.meta.url));
const REGULAR_FONT_PATH = fileURLToPath(new URL("../assets/inter-latin-400-normal.woff", import.meta.url));
const BOLD_FONT_PATH = fileURLToPath(new URL("../assets/inter-latin-700-normal.woff", import.meta.url));
const ITI_POLICY_OID = "2.16.76.1.7.1.11.1.3";
const ITI_VALIDATOR_URL = "https://validar.iti.gov.br/";
const ITI_ELIGIBLE_INFRASTRUCTURES = new Set(["icpbrasil", "govbr", "assinaturagovbr"]);
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

function clean(value, fallback = "Não informado", max = 180) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g, "?")
    .slice(0, max);
}

function normalizedInfrastructure(value) {
  return clean(value, "", 80).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isIcpBrasilSignature(signature) {
  return normalizedInfrastructure(signature?.infrastructure) === "icpbrasil";
}

export function isItiValidationEligible(signature) {
  return ITI_ELIGIBLE_INFRASTRUCTURES.has(normalizedInfrastructure(signature?.infrastructure));
}

function signatureTypeLabel(signature) {
  const format = clean(signature?.format, "Assinatura eletrônica", 40);
  const profile = clean(signature?.profile, "", 40);
  const infrastructure = clean(signature?.infrastructure, "", 80);
  const profileSuffix = profile && normalizedInfrastructure(profile) !== normalizedInfrastructure(format)
    ? ` ${profile}`
    : "";
  const infrastructureSuffix = infrastructure
    && !normalizedInfrastructure(infrastructure).includes(normalizedInfrastructure(format))
    ? ` · ${infrastructure}`
    : "";
  return `${format}${profileSuffix}${infrastructureSuffix}`;
}

function fitText(font, value, size, width) {
  const text = clean(value);
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}...`, size) > width) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function fitValue(font, value, preferredSize, width, minimumSize = 6.8) {
  const text = clean(value);
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > width) size = Number((size - 0.2).toFixed(1));
  return { text: fitText(font, text, size, width), size };
}

function fitUnbrokenValue(font, value, preferredSize, width, minimumSize = 4.2) {
  const text = clean(value, "", 512);
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > width) size = Number((size - 0.2).toFixed(1));
  if (font.widthOfTextAtSize(text, size) > width) {
    throw new RangeError("A inscrição lateral integral excede o espaço disponível.");
  }
  return { text, size };
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

function rect(block) {
  return { x: block.left, y: pdfY(block.top, block.height), width: block.width, height: block.height };
}

function baseline(top) {
  return A4.height - top;
}

function drawLabelValue(page, fonts, label, value, x, top, width, valueSize = TYPOGRAPHY.value) {
  const fitted = fitValue(fonts.regular, value, valueSize, width);
  page.drawText(label, { x, y: baseline(top + 10), font: fonts.bold, size: TYPOGRAPHY.label, color: MUTED });
  page.drawText(fitted.text, {
    x, y: baseline(top + 25), font: fonts.regular, size: fitted.size, color: INK,
  });
}

function drawAttributeSignal(page, fonts, { label, value, top, color }) {
  page.drawCircle({ x: BODY.left + 15, y: baseline(top + 1), size: 3.2, color });
  page.drawText(label, { x: BODY.left + 25, y: baseline(top), font: fonts.bold, size: 8, color: MUTED });
  page.drawText(fitText(fonts.regular, value, 8, BODY.width - 146), {
    x: BODY.left + 130, y: baseline(top), font: fonts.regular, size: 8, color: INK,
  });
}

function drawPadesMark(page, fonts) {
  const markWidth = 86;
  const markX = SIGNATURE_FRAME.left + SIGNATURE_FRAME.width - 103;
  const label = "PAdES";
  const labelSize = 22;
  const labelWidth = fonts.bold.widthOfTextAtSize(label, labelSize);
  const subtitle = "PDF SIGNATURE";
  const subtitleSize = 6.2;
  const subtitleWidth = fonts.bold.widthOfTextAtSize(subtitle, subtitleSize);

  page.drawText(label, {
    x: markX + (markWidth - labelWidth) / 2,
    y: SIGNATURE_FRAME.bottom + 43,
    font: fonts.bold,
    size: labelSize,
    color: BLUE,
  });
  page.drawRectangle({
    x: markX + 8,
    y: SIGNATURE_FRAME.bottom + 36,
    width: markWidth - 16,
    height: 1.5,
    color: GOLD,
  });
  page.drawText(subtitle, {
    x: markX + (markWidth - subtitleWidth) / 2,
    y: SIGNATURE_FRAME.bottom + 25,
    font: fonts.bold,
    size: subtitleSize,
    color: MUTED,
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

function addLink(document, page, { x, y, width, height, url }) {
  const action = document.context.obj({
    Type: PDFName.of("Action"),
    S: PDFName.of("URI"),
    URI: PDFString.of(url),
  });
  const annotation = document.context.register(document.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    A: action,
  }));
  page.node.addAnnot(annotation);
}

async function embeddedFonts(document) {
  document.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    document.embedFont(await readFile(REGULAR_FONT_PATH), { subset: true }),
    document.embedFont(await readFile(BOLD_FONT_PATH), { subset: true }),
  ]);
  return { regular, bold, mono: regular };
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
  const infrastructure = clean(signingMetadata?.infrastructure, "Não informada", 80);
  const icpBrasil = isIcpBrasilSignature({ infrastructure });
  const itiValidationEligible = isItiValidationEligible({ infrastructure });
  return {
    schema: "https://assinatura.maiocchi.adv.br/schemas/pades-evidence-manifest-v1.json",
    version: "1.2.0",
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
      format: clean(signingMetadata?.format, "PAdES", 24),
      infrastructure,
      profile: clean(signingMetadata?.profile, icpBrasil ? "AD-RB" : "Não informado", 40),
      policyOid: icpBrasil ? ITI_POLICY_OID : null,
      tokenType: clean(signingMetadata?.tokenType, "Não informado", 100),
      signerIdentitySource: icpBrasil ? "certificado-digital" : "modalidade-informada",
      itiValidationEligible,
      optionalAttributes: icpBrasil ? {
        normativeDocument: "DOC-ICP-15.03 v9.1",
        assurance: signingMetadata?.modality === "remote" ? "psc-final-validation" : "private-provider-enforced",
        incorporated: [...ITI_OPTIONAL_ATTRIBUTES.incorporated],
        actConditional: [...ITI_OPTIONAL_ATTRIBUTES.actConditional],
        contextualOrDefault: [...ITI_OPTIONAL_ATTRIBUTES.contextualOrDefault],
      } : null,
    },
  };
}

export async function composePadesEvidence({ sourcePdf, manifest, attestation, baseUrl = "https://assinatura.maiocchi.adv.br" }) {
  const verificationUrl = portalVerificationUrl(manifest.publicId, baseUrl);
  const verificationDisplay = new URL(verificationUrl);
  const verificationHost = `${verificationDisplay.host}${verificationDisplay.pathname}`;
  const icpBrasil = isIcpBrasilSignature(manifest.signature);
  const itiValidationEligible = isItiValidationEligible(manifest.signature);
  const document = await PDFDocument.load(sourcePdf, { updateMetadata: false });
  const fonts = await embeddedFonts(document);
  const maiocchiMark = await document.embedPng(await readFile(MAIOCCHI_MARK_PATH));
  const securitySeal = await document.embedPng(await readFile(SECURITY_SEAL_PATH));
  const icpLogo = icpBrasil
    ? await document.embedPng(await readFile(ICP_LOGO_PATH))
    : null;
  const qr = await document.embedPng(await QRCode.toBuffer(verificationUrl, {
    type: "png", width: 600, margin: 4, errorCorrectionLevel: "H",
  }));
  const barcodeValue = `MAI|${manifest.publicId}|R1`;
  const barcode = await document.embedPng(await bwipjs.toBuffer({
    bcid: "code128", text: barcodeValue, scale: 4, height: 14, includetext: false,
    paddingwidth: 8, paddingheight: 0,
  }));

  const originalPages = document.getPages();
  const totalPages = originalPages.length + 1;
  const drawTopRule = (page) => {
    page.drawRectangle({
      x: 0,
      y: page.getHeight() - PAGE_CHROME.topRuleHeight,
      width: page.getWidth(),
      height: PAGE_CHROME.topRuleHeight,
      color: GOLD,
    });
  };
  const drawContentRail = (page) => {
    const width = page.getWidth();
    const height = page.getHeight();
    const registry = `DOCUMENTO ${manifest.documentNumber} - HASH ${manifest.source.sha256} - CÓDIGO ${attestation.code} - VERIFICAÇÃO ${manifest.publicId}`;
    const railLeft = width - PAGE_CHROME.sideRailWidth;
    const markY = height - PAGE_CHROME.sideMarkTop - PAGE_CHROME.sideMarkSize;
    const registryStartY = markY - PAGE_CHROME.sideRegistryGap;
    const availableLength = Math.max(80, registryStartY - PAGE_MARGINS.bottom);
    page.drawRectangle({
      x: railLeft,
      y: PAGE_MARGINS.bottom,
      width: PAGE_CHROME.sideRailWidth,
      height: height - PAGE_MARGINS.bottom - PAGE_CHROME.topRuleHeight,
      color: rgb(1, 1, 1),
      opacity: 0.92,
    });
    page.drawImage(maiocchiMark, {
      x: railLeft + (PAGE_CHROME.sideRailWidth - PAGE_CHROME.sideMarkSize) / 2,
      y: markY,
      width: PAGE_CHROME.sideMarkSize,
      height: PAGE_CHROME.sideMarkSize,
      opacity: 0.9,
    });
    const fitted = fitUnbrokenValue(
      fonts.bold,
      registry,
      PAGE_CHROME.sideRegistryFontSize,
      availableLength,
      PAGE_CHROME.sideRegistryMinimumFontSize,
    );
    page.drawText(fitted.text, {
      x: width - PAGE_CHROME.sideRegistryRight,
      y: registryStartY,
      font: fonts.bold,
      size: fitted.size,
      color: MUTED,
      opacity: 0.88,
      rotate: degrees(-90),
    });
  };
  originalPages.forEach((originalPage) => {
    drawContentRail(originalPage);
    drawTopRule(originalPage);
  });

  const page = document.addPage([A4.width, A4.height]);
  page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: rgb(1, 1, 1) });
  drawTopRule(page);
  const evidenceHeader = "EVIDÊNCIAS DA ASSINATURA DIGITAL";
  const modalityHeader = icpBrasil
    ? "MODALIDADE · ICP-BRASIL"
    : `MODALIDADE · ${manifest.signature.infrastructure.toUpperCase()}`;
  const fittedModalityHeader = fitValue(fonts.regular, modalityHeader, 7.5, EVIDENCE_BLOCKS.header.width / 2, 6.4);
  page.drawText(evidenceHeader, {
    x: EVIDENCE_BLOCKS.header.left,
    y: baseline(EVIDENCE_BLOCKS.header.top + 15),
    font: fonts.bold,
    size: 7.6,
    color: MUTED,
  });
  page.drawText(fittedModalityHeader.text, {
    x: EVIDENCE_BLOCKS.header.left + EVIDENCE_BLOCKS.header.width
      - fonts.regular.widthOfTextAtSize(fittedModalityHeader.text, fittedModalityHeader.size),
    y: baseline(EVIDENCE_BLOCKS.header.top + 15),
    font: fonts.regular,
    size: fittedModalityHeader.size,
    color: icpBrasil ? GREEN : MUTED,
  });

  page.drawText("Documento eletrônico assinado", {
    x: EVIDENCE_BLOCKS.title.left,
    y: baseline(EVIDENCE_BLOCKS.title.top + 21),
    font: fonts.bold,
    size: TYPOGRAPHY.title,
    color: INK,
  });
  wrap(fonts.regular,
    "O arquivo eletrônico assinado é o original. Esta página organiza evidências de conferência; sinais gráficos não substituem a validação criptográfica.",
    TYPOGRAPHY.subtitle, BODY.width, 2).forEach((line, index) => page.drawText(line, {
      x: EVIDENCE_BLOCKS.title.left,
      y: baseline(EVIDENCE_BLOCKS.title.top + 39 + index * 12),
      font: fonts.regular,
      size: TYPOGRAPHY.subtitle,
      color: MUTED,
    }));

  page.drawRectangle({ ...rect(EVIDENCE_BLOCKS.document), color: PALE, borderColor: LINE, borderWidth: 0.5 });
  const leftColumnX = BODY.left + 12;
  const rightColumnX = BODY.left + BODY.width / 2 + 7;
  const leftColumnWidth = BODY.width / 2 - 23;
  const rightColumnWidth = BODY.right - rightColumnX - 12;
  drawLabelValue(page, fonts, "CÓDIGO DE VERIFICAÇÃO", manifest.publicId, leftColumnX, EVIDENCE_BLOCKS.document.top + 2, leftColumnWidth);
  drawLabelValue(page, fonts, "NÚMERO DO DOCUMENTO", manifest.documentNumber, rightColumnX, EVIDENCE_BLOCKS.document.top + 2, rightColumnWidth);
  drawLabelValue(page, fonts, "ARQUIVO", manifest.source.name, leftColumnX, EVIDENCE_BLOCKS.document.top + 31, leftColumnWidth);
  drawLabelValue(page, fonts, "PÁGINAS", `${totalPages} (${manifest.source.pageCount} originais + 1 evidência)`, rightColumnX, EVIDENCE_BLOCKS.document.top + 31, rightColumnWidth);

  page.drawText("HASH SHA-256 DO PDF PREPARADO PARA ASSINATURA", {
    x: EVIDENCE_BLOCKS.hash.left,
    y: baseline(EVIDENCE_BLOCKS.hash.top + 10),
    font: fonts.bold,
    size: TYPOGRAPHY.label,
    color: MUTED,
  });
  splitHash(manifest.source.sha256).forEach((line, index) => page.drawText(line, {
    x: EVIDENCE_BLOCKS.hash.left,
    y: baseline(EVIDENCE_BLOCKS.hash.top + 29 + index * 13),
    font: fonts.regular,
    size: 8.2,
    color: INK,
  }));
  page.drawText("O hash integral do PDF final assinado é publicado no endereço de validação.", {
    x: EVIDENCE_BLOCKS.hash.left,
    y: baseline(EVIDENCE_BLOCKS.hash.top + 62),
    font: fonts.regular,
    size: 7.2,
    color: MUTED,
  });
  page.drawImage(qr, rect(EVIDENCE_BLOCKS.qr));
  addLink(document, page, { ...rect(EVIDENCE_BLOCKS.qr), url: verificationUrl });

  page.drawLine({
    start: { x: BODY.left, y: baseline(EVIDENCE_BLOCKS.context.top) },
    end: { x: BODY.right, y: baseline(EVIDENCE_BLOCKS.context.top) },
    thickness: 0.6,
    color: LINE,
  });
  page.drawText("IDENTIFICAÇÃO E EVENTOS", {
    x: BODY.left,
    y: baseline(EVIDENCE_BLOCKS.context.top + 13),
    font: fonts.bold,
    size: 7.4,
    color: MUTED,
  });
  drawLabelValue(page, fonts, "EMITENTE / GERADO POR", `${manifest.generatedBy.name} · CPF ${manifest.generatedBy.nationalIdMasked} · ${manifest.generatedBy.professionalRegistration}`, leftColumnX, EVIDENCE_BLOCKS.context.top + 18, BODY.width - 24);
  drawLabelValue(page, fonts, "DESTINADO A", manifest.intendedFor, leftColumnX, EVIDENCE_BLOCKS.context.top + 45, leftColumnWidth);
  drawLabelValue(page, fonts, "FINALIDADE", manifest.purpose, rightColumnX, EVIDENCE_BLOCKS.context.top + 45, rightColumnWidth);
  drawLabelValue(page, fonts, "EVENTO 1 · DOCUMENTO PREPARADO", `${formatDate(manifest.createdAt)} · America/Sao_Paulo`, leftColumnX, EVIDENCE_BLOCKS.context.top + 72, leftColumnWidth);
  drawLabelValue(page, fonts, "EVENTO 2 · ASSINATURA", "Instante registrado no resumo visual abaixo", rightColumnX, EVIDENCE_BLOCKS.context.top + 72, rightColumnWidth);
  drawLabelValue(page, fonts, "TOKEN / MODALIDADE", manifest.signature.tokenType, leftColumnX, EVIDENCE_BLOCKS.context.top + 99, leftColumnWidth);
  drawLabelValue(page, fonts, "TIPO", signatureTypeLabel(manifest.signature), rightColumnX, EVIDENCE_BLOCKS.context.top + 99, rightColumnWidth);
  drawLabelValue(page, fonts, "AMBIENTE", `${manifest.signingEnvironment.platform} · ${manifest.signingEnvironment.locale} · ${manifest.signingEnvironment.timezone}`, leftColumnX, EVIDENCE_BLOCKS.context.top + 124, leftColumnWidth);
  const location = manifest.signingEnvironment.geolocation
    ? `${manifest.signingEnvironment.geolocation.latitude}, ${manifest.signingEnvironment.geolocation.longitude} (±${manifest.signingEnvironment.geolocation.accuracyMeters} m)`
    : "Não fornecida pelo usuário";
  drawLabelValue(page, fonts, "IP / LOCALIZAÇÃO", `${manifest.signingEnvironment.observedIp} · ${location}`, rightColumnX, EVIDENCE_BLOCKS.context.top + 124, rightColumnWidth);

  page.drawRectangle({ ...rect(EVIDENCE_BLOCKS.attributes), color: PALE, borderColor: LINE, borderWidth: 0.5 });
  if (icpBrasil && manifest.signature.optionalAttributes) {
    const optionalAttributes = manifest.signature.optionalAttributes;
    page.drawText("ATRIBUTOS CONFIRMADOS NO PAdES", {
      x: leftColumnX,
      y: baseline(EVIDENCE_BLOCKS.attributes.top + 13),
      font: fonts.bold,
      size: 7.4,
      color: MUTED,
    });
    const optionalPolicy = `${optionalAttributes.normativeDocument} · AD-RB v1.3 · OID ${manifest.signature.policyOid}`;
    page.drawText(fitText(fonts.regular, optionalPolicy, 6.8, 205), {
      x: BODY.right - 12 - fonts.regular.widthOfTextAtSize(fitText(fonts.regular, optionalPolicy, 6.8, 205), 6.8),
      y: baseline(EVIDENCE_BLOCKS.attributes.top + 13),
      font: fonts.regular,
      size: 6.8,
      color: MUTED,
    });
    drawAttributeSignal(page, fonts, {
      label: optionalAttributes.assurance === "private-provider-enforced" ? "INCORPORADOS" : "PSC / CONFERIR",
      value: optionalAttributes.incorporated.join(" · "), top: EVIDENCE_BLOCKS.attributes.top + 31, color: GREEN,
    });
    drawAttributeSignal(page, fonts, {
      label: "ACT / CONDICIONAL", value: optionalAttributes.actConditional.join(" · "), top: EVIDENCE_BLOCKS.attributes.top + 46, color: GOLD,
    });
    drawAttributeSignal(page, fonts, {
      label: "CONTEXTO / PADRÃO", value: optionalAttributes.contextualOrDefault.join(" · "), top: EVIDENCE_BLOCKS.attributes.top + 61, color: MUTED,
    });
  } else {
    page.drawText("ATRIBUTOS DA ASSINATURA", {
      x: leftColumnX,
      y: baseline(EVIDENCE_BLOCKS.attributes.top + 13),
      font: fonts.bold,
      size: 7.4,
      color: MUTED,
    });
    drawAttributeSignal(page, fonts, { label: "FORMATO", value: manifest.signature.format, top: EVIDENCE_BLOCKS.attributes.top + 31, color: BLUE });
    drawAttributeSignal(page, fonts, { label: "MODALIDADE", value: manifest.signature.infrastructure, top: EVIDENCE_BLOCKS.attributes.top + 46, color: MUTED });
    drawAttributeSignal(page, fonts, { label: "CONFERÊNCIA", value: "Consultar QR e código de verificação", top: EVIDENCE_BLOCKS.attributes.top + 61, color: MUTED });
  }

  page.drawRectangle({ ...rect(EVIDENCE_BLOCKS.pqc), color: PALE, borderColor: LINE, borderWidth: 0.5 });
  page.drawText("ATESTADO PÓS-QUÂNTICO DO MANIFESTO", {
    x: EVIDENCE_BLOCKS.pqc.left + 12,
    y: baseline(EVIDENCE_BLOCKS.pqc.top + 12),
    font: fonts.bold,
    size: 7.2,
    color: MUTED,
  });
  page.drawText(attestation.code, {
    x: EVIDENCE_BLOCKS.pqc.left + 12,
    y: baseline(EVIDENCE_BLOCKS.pqc.top + 29),
    font: fonts.bold,
    size: 8.2,
    color: INK,
  });
  page.drawText(`ML-DSA-65 · chave ${attestation.keyId} · evidência complementar`, {
    x: EVIDENCE_BLOCKS.pqc.left + 12,
    y: baseline(EVIDENCE_BLOCKS.pqc.top + 44),
    font: fonts.regular,
    size: 6.8,
    color: MUTED,
  });

  page.drawRectangle({ ...rect(EVIDENCE_BLOCKS.validation), borderColor: GOLD, borderWidth: 1 });
  page.drawText("VALIDAR O ORIGINAL", {
    x: EVIDENCE_BLOCKS.validation.left + 10,
    y: baseline(EVIDENCE_BLOCKS.validation.top + 12),
    font: fonts.bold,
    size: 7.2,
    color: BLUE,
  });
  page.drawText(verificationHost, {
    x: EVIDENCE_BLOCKS.validation.left + 10,
    y: baseline(EVIDENCE_BLOCKS.validation.top + 29),
    font: fonts.regular,
    size: 7.2,
    color: INK,
  });
  const verificationHostWidth = fonts.regular.widthOfTextAtSize(verificationHost, 7.2);
  addLink(document, page, {
    x: EVIDENCE_BLOCKS.validation.left + 10,
    y: baseline(EVIDENCE_BLOCKS.validation.top + 32),
    width: verificationHostWidth,
    height: 10,
    url: verificationUrl,
  });
  if (itiValidationEligible) {
    const itiHost = "validar.iti.gov.br";
    const itiHostWidth = fonts.bold.widthOfTextAtSize(itiHost, 7.2);
    page.drawText(itiHost, {
      x: EVIDENCE_BLOCKS.validation.left + 10,
      y: baseline(EVIDENCE_BLOCKS.validation.top + 44),
      font: fonts.bold,
      size: 7.2,
      color: BLUE,
    });
    addLink(document, page, {
      x: EVIDENCE_BLOCKS.validation.left + 10,
      y: baseline(EVIDENCE_BLOCKS.validation.top + 47),
      width: itiHostWidth,
      height: 10,
      url: ITI_VALIDATOR_URL,
    });
  }

  page.drawImage(barcode, {
    x: EVIDENCE_BLOCKS.barcode.left,
    y: pdfY(EVIDENCE_BLOCKS.barcode.top + 5, 24),
    width: EVIDENCE_BLOCKS.barcode.width,
    height: 24,
  });

  const signatureFrameRect = {
    x: SIGNATURE_FRAME.left,
    y: SIGNATURE_FRAME.bottom,
    width: SIGNATURE_FRAME.width,
    height: SIGNATURE_FRAME.height,
  };
  page.drawImage(securitySeal, signatureFrameRect);
  if (icpBrasil) {
    page.drawImage(icpLogo, {
      x: SIGNATURE_FRAME.left + SIGNATURE_FRAME.width - 103,
      y: SIGNATURE_FRAME.bottom + 33,
      width: 86,
      height: 29,
    });
  } else {
    drawPadesMark(page, fonts);
  }

  const legalText = icpBrasil
    ? "MP 2.200-2/2001, art. 10, § 1º · L 14.063/2020, art. 4º, III."
    : "Assinatura eletrônica conforme a modalidade registrada · MP 2.200-2/2001, art. 10, § 2º · Lei 14.063/2020, art. 4º.";
  wrap(fonts.regular, legalText, 6.8, BODY.width, 2).forEach((line, index) => page.drawText(line, {
    x: EVIDENCE_BLOCKS.legal.left,
    y: baseline(EVIDENCE_BLOCKS.legal.top + 14 + index * 10),
    font: fonts.regular,
    size: 6.8,
    color: MUTED,
  }));

  document.catalog.set(PDFName.of("Lang"), PDFString.of("pt-BR"));
  document.setTitle(manifest.source.name.replace(/\.pdf$/i, ""));
  document.setAuthor("Maiocchi Advogado");
  document.setSubject(`${manifest.signature.format} ${manifest.signature.infrastructure} · ${manifest.publicId}`);
  document.setCreator("Maiocchi Assinatura");
  document.setProducer("Maiocchi Assinatura");
  document.setKeywords([
    manifest.signature.format,
    manifest.signature.infrastructure,
    manifest.publicId,
    manifest.documentNumber,
    attestation.code,
  ]);
  document.setCreationDate(new Date(manifest.createdAt));
  document.setModificationDate(new Date(manifest.createdAt));

  const presentation = Buffer.from(await document.save({ useObjectStreams: false, addDefaultPage: false }));
  const sheetDocument = await PDFDocument.create();
  const [copied] = await sheetDocument.copyPages(document, [document.getPageCount() - 1]);
  sheetDocument.addPage(copied);
  sheetDocument.catalog.set(PDFName.of("Lang"), PDFString.of("pt-BR"));
  const evidencePage = Buffer.from(await sheetDocument.save({ useObjectStreams: false, addDefaultPage: false }));
  return {
    presentation,
    evidencePage,
    totalPages,
    verificationUrl,
    barcodeValue,
    signatureBox: SIGNATURE_BOX,
    signatureFrame: SIGNATURE_FRAME,
    pageMargins: PAGE_MARGINS,
    icpBrasilSealIncluded: icpBrasil,
    visualSealMark: icpBrasil ? "ICP-Brasil" : "PAdES",
    itiValidatorUrl: itiValidationEligible ? ITI_VALIDATOR_URL : null,
  };
}

export { PAGE_MARGINS, SIGNATURE_BOX, SIGNATURE_FRAME };
