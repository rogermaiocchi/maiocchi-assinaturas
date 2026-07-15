import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  degrees,
  rgb,
} from "pdf-lib";
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
const PAPER = rgb(0.992, 0.996, 0.994);
const ICP_LOGO_PATH = fileURLToPath(new URL("../assets/icp-brasil-oficial.png", import.meta.url));
const MAIOCCHI_MARK_PATH = fileURLToPath(new URL("../assets/maiocchi-mark.png", import.meta.url));
const EVIDENCE_BACKGROUND_PATH = fileURLToPath(new URL("../assets/pades-evidence-page.png", import.meta.url));
const SRGB_PROFILE_PATH = fileURLToPath(new URL("../assets/srgb.icc", import.meta.url));
const REGULAR_FONT_PATH = fileURLToPath(new URL("../assets/inter-latin-400-normal.woff", import.meta.url));
const BOLD_FONT_PATH = fileURLToPath(new URL("../assets/inter-latin-700-normal.woff", import.meta.url));
const ITI_POLICY_OID = "2.16.76.1.7.1.11.1.3";
const ITI_VALIDATOR_URL = "https://validar.iti.gov.br/";
const LUCIDE_GLOBE_PATH = "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0 M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20";
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

function isExpectedAdbeExtension(value, context) {
  const dictionary = context.lookup(value);
  if (!(dictionary instanceof PDFDict)) return false;
  const keys = dictionary.entries().map(([key]) => key.toString()).sort();
  const baseVersion = context.lookup(dictionary.get(PDFName.of("BaseVersion")));
  const extensionLevel = context.lookup(dictionary.get(PDFName.of("ExtensionLevel")));
  return JSON.stringify(keys) === JSON.stringify(["/BaseVersion", "/ExtensionLevel"])
    && baseVersion instanceof PDFName
    && baseVersion.asString() === "/1.7"
    && extensionLevel instanceof PDFNumber
    && extensionLevel.asNumber() === 8;
}

async function ensurePadesCatalog(document) {
  const { catalog, context } = document;
  const extensionsKey = PDFName.of("Extensions");
  const adbeKey = PDFName.of("ADBE");
  const existingExtensions = catalog.get(extensionsKey);
  let extensions;
  if (existingExtensions === undefined) {
    extensions = context.obj({});
    catalog.set(extensionsKey, extensions);
  } else {
    extensions = context.lookup(existingExtensions);
    if (!(extensions instanceof PDFDict)) throw new TypeError("PDF Extensions catalog entry must be a dictionary");
  }
  if (!extensions.has(adbeKey)) {
    extensions.set(adbeKey, context.obj({
      BaseVersion: PDFName.of("1.7"),
      ExtensionLevel: PDFNumber.of(8),
    }));
  } else if (!isExpectedAdbeExtension(extensions.get(adbeKey), context)) {
    throw new TypeError("PDF ADBE developer extension must be version 1.7 level 8");
  }

  const outputIntentsKey = PDFName.of("OutputIntents");
  const existingOutputIntents = catalog.get(outputIntentsKey);
  if (existingOutputIntents !== undefined) {
    const outputIntents = context.lookup(existingOutputIntents);
    if (!(outputIntents instanceof PDFArray)) throw new TypeError("PDF OutputIntents catalog entry must be an array");
    if (outputIntents.size() > 0) return;
  }
  const profileStream = context.flateStream(await readFile(SRGB_PROFILE_PATH), {
    N: PDFNumber.of(3),
  });
  const profileReference = context.register(profileStream);
  const outputIntentReference = context.register(context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFA1"),
    DestOutputProfile: profileReference,
    OutputCondition: PDFString.of("sRGB"),
    OutputConditionIdentifier: PDFString.of("sRGB"),
  }));
  catalog.set(outputIntentsKey, context.obj([outputIntentReference]));
}

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

function normalizedSigners(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((entry) => {
    const signedAt = new Date(entry?.signedAt);
    return {
      name: clean(entry?.name, "Signatário identificado no documento", 140),
      role: clean(entry?.role, "Signatário", 80),
      modality: clean(entry?.modality, "simple", 40),
      profile: clean(entry?.profile, "SIMPLES RASTREÁVEL", 40),
      format: clean(entry?.format, "Assinatura eletrônica", 48),
      infrastructure: clean(entry?.infrastructure, "Maiocchi. Assinatura", 80),
      legalBasis: clean(entry?.legalBasis, "MP 2.200-2/2001, art. 10, § 2º", 180),
      identitySource: clean(entry?.identitySource, "Sessão eletrônica rastreada", 100),
      signedAt: Number.isNaN(signedAt.getTime()) ? null : signedAt.toISOString(),
    };
  });
}

export function isIcpBrasilSignature(signature) {
  return normalizedInfrastructure(signature?.infrastructure) === "icpbrasil";
}

export function isItiValidationEligible(signature) {
  return ITI_ELIGIBLE_INFRASTRUCTURES.has(normalizedInfrastructure(signature?.infrastructure));
}

function signatureTypeLabel(signature) {
  const format = clean(signature?.format, "Assinatura eletrônica", 40);
  if (!isIcpBrasilSignature(signature)) return format;

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

function drawPanel(page, block, { accent = null, opacity = 0.72 } = {}) {
  page.drawRectangle({
    ...rect(block),
    color: PAPER,
    opacity,
  });
  if (accent) {
    page.drawRectangle({
      x: block.left,
      y: pdfY(block.top, block.height),
      width: 2.2,
      height: block.height,
      color: accent,
      opacity: 0.82,
    });
  }
}

function drawLucideGlobe(page, { x, top, size = 8.6, color = BLUE }) {
  page.drawSvgPath(LUCIDE_GLOBE_PATH, {
    x,
    y: baseline(top),
    scale: size / 24,
    borderColor: color,
    borderWidth: 2,
    borderOpacity: 0.92,
  });
}

function drawSectionHeading(page, fonts, index, label, block, rightText = null) {
  const badgeSize = 13;
  const badgeX = block.left + 12;
  const badgeY = baseline(block.top + 18);
  page.drawRectangle({
    x: badgeX,
    y: badgeY - 3,
    width: badgeSize,
    height: badgeSize,
    color: INK,
    opacity: 0.9,
  });
  page.drawText(index, {
    x: badgeX + 3.1,
    y: badgeY,
    font: fonts.bold,
    size: 6.2,
    color: rgb(1, 1, 1),
  });
  page.drawText(label, {
    x: badgeX + badgeSize + 8,
    y: badgeY,
    font: fonts.bold,
    size: 7.2,
    color: MUTED,
  });
  if (rightText) {
    const fitted = fitValue(fonts.regular, rightText, 6.6, block.width / 2 - 20, 5.8);
    page.drawText(fitted.text, {
      x: block.left + block.width - 12 - fonts.regular.widthOfTextAtSize(fitted.text, fitted.size),
      y: badgeY,
      font: fonts.regular,
      size: fitted.size,
      color: MUTED,
    });
  }
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
  let document;
  try {
    document = await PDFDocument.load(pdf, { updateMetadata: false });
  } catch (error) {
    throw Object.assign(new Error("source PDF is malformed", { cause: error }), { status: 422 });
  }
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
      format: clean(signingMetadata?.format, "PAdES", 48),
      infrastructure,
      profile: clean(signingMetadata?.profile, icpBrasil ? "AD-RB" : "Não informado", 40),
      policyOid: icpBrasil ? ITI_POLICY_OID : null,
      tokenType: clean(signingMetadata?.tokenType, "Não informado", 100),
      legalBasis: clean(signingMetadata?.legalBasis, "MP 2.200-2/2001, art. 10, § 2º · Lei 14.063/2020, art. 4º.", 180),
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
    signers: normalizedSigners(signingMetadata?.signers),
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
  const evidenceBackground = await document.embedPng(await readFile(EVIDENCE_BACKGROUND_PATH));
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
  const drawContentRail = (page, pageNumber) => {
    const width = page.getWidth();
    const height = page.getHeight();
    const registry = `ASSINATURA.MAIOCCHI.ADV.BR - DOCUMENTO ${manifest.documentNumber} - HASH ${manifest.source.sha256} - CÓDIGO ${attestation.code} - VERIFICAÇÃO ${manifest.publicId} - PÁG ${pageNumber} DE ${totalPages}`;
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
  originalPages.forEach((originalPage, index) => {
    drawContentRail(originalPage, index + 1);
    drawTopRule(originalPage);
  });

  const page = document.addPage([A4.width, A4.height]);
  page.drawImage(evidenceBackground, { x: 0, y: 0, width: A4.width, height: A4.height });
  drawTopRule(page);
  const evidenceHeader = "EVIDÊNCIAS DA ASSINATURA DIGITAL";
  const modalityHeader = icpBrasil
    ? "MODALIDADE · ICP-BRASIL"
    : `MODALIDADE · ${manifest.signature.profile.toUpperCase()}`;
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

  page.drawRectangle({ ...rect(EVIDENCE_BLOCKS.title), color: PAPER, opacity: 0.64 });
  page.drawRectangle({
    x: EVIDENCE_BLOCKS.title.left,
    y: pdfY(EVIDENCE_BLOCKS.title.top, EVIDENCE_BLOCKS.title.height),
    width: 3,
    height: EVIDENCE_BLOCKS.title.height,
    color: GOLD,
    opacity: 0.88,
  });
  page.drawText("Documento eletrônico assinado", {
    x: EVIDENCE_BLOCKS.title.left + 14,
    y: baseline(EVIDENCE_BLOCKS.title.top + 21),
    font: fonts.bold,
    size: TYPOGRAPHY.title,
    color: INK,
  });
  wrap(fonts.regular,
    "O arquivo eletrônico assinado é o original. Esta página organiza evidências de conferência; sinais gráficos não substituem a validação criptográfica.",
    TYPOGRAPHY.subtitle, BODY.width - 18, 2).forEach((line, index) => page.drawText(line, {
      x: EVIDENCE_BLOCKS.title.left + 14,
      y: baseline(EVIDENCE_BLOCKS.title.top + 39 + index * 12),
      font: fonts.regular,
      size: TYPOGRAPHY.subtitle,
      color: MUTED,
    }));

  drawPanel(page, EVIDENCE_BLOCKS.document, { accent: GOLD, opacity: 0.72 });
  drawSectionHeading(page, fonts, "01", "IDENTIDADE DO DOCUMENTO", EVIDENCE_BLOCKS.document);
  const leftColumnX = BODY.left + 16;
  const rightColumnX = BODY.left + BODY.width / 2 + 7;
  const leftColumnWidth = BODY.width / 2 - 23;
  const rightColumnWidth = BODY.right - rightColumnX - 12;
  const documentRightColumnWidth = EVIDENCE_BLOCKS.qr.left - rightColumnX - 10;
  drawLabelValue(page, fonts, "CÓDIGO DE VERIFICAÇÃO", manifest.publicId, leftColumnX, EVIDENCE_BLOCKS.document.top + 24, leftColumnWidth);
  drawLabelValue(page, fonts, "NÚMERO DO DOCUMENTO", manifest.documentNumber, rightColumnX, EVIDENCE_BLOCKS.document.top + 24, documentRightColumnWidth);
  drawLabelValue(page, fonts, "ARQUIVO", manifest.source.name, leftColumnX, EVIDENCE_BLOCKS.document.top + 50, leftColumnWidth);
  drawLabelValue(page, fonts, "PÁGINAS", `${totalPages} (${manifest.source.pageCount} originais + 1 evidência)`, rightColumnX, EVIDENCE_BLOCKS.document.top + 50, documentRightColumnWidth);

  page.drawText("HASH SHA-256 DO PDF PREPARADO PARA ASSINATURA", {
    x: EVIDENCE_BLOCKS.hash.left,
    y: baseline(EVIDENCE_BLOCKS.hash.top + 8),
    font: fonts.bold,
    size: 6.8,
    color: MUTED,
  });
  splitHash(manifest.source.sha256).forEach((line, index) => page.drawText(line, {
    x: EVIDENCE_BLOCKS.hash.left,
    y: baseline(EVIDENCE_BLOCKS.hash.top + 21 + index * 11),
    font: fonts.regular,
    size: 7.5,
    color: INK,
  }));
  const qrRect = rect(EVIDENCE_BLOCKS.qr);
  page.drawRectangle({ ...qrRect, color: rgb(1, 1, 1), opacity: 0.84 });
  page.drawImage(qr, {
    x: qrRect.x + 4,
    y: qrRect.y + 4,
    width: qrRect.width - 8,
    height: qrRect.height - 8,
  });
  addLink(document, page, { ...qrRect, url: verificationUrl });

  drawPanel(page, EVIDENCE_BLOCKS.context, { accent: GREEN, opacity: 0.7 });
  drawSectionHeading(page, fonts, "02", "IDENTIFICAÇÃO, CONTEXTO E EVENTOS", EVIDENCE_BLOCKS.context);
  drawLabelValue(page, fonts, "RESPONSÁVEL PELA GERAÇÃO", `${manifest.generatedBy.name} · CPF ${manifest.generatedBy.nationalIdMasked} · ${manifest.generatedBy.professionalRegistration}`, leftColumnX, EVIDENCE_BLOCKS.context.top + 24, BODY.width - 32);
  drawLabelValue(page, fonts, "DESTINADO A", manifest.intendedFor, leftColumnX, EVIDENCE_BLOCKS.context.top + 51, leftColumnWidth);
  drawLabelValue(page, fonts, "FINALIDADE", manifest.purpose, rightColumnX, EVIDENCE_BLOCKS.context.top + 51, rightColumnWidth);
  drawLabelValue(page, fonts, "EVENTO 1 · DOCUMENTO PREPARADO", `${formatDate(manifest.createdAt)} · America/Sao_Paulo`, leftColumnX, EVIDENCE_BLOCKS.context.top + 78, leftColumnWidth);
  drawLabelValue(page, fonts, "EVENTO 2 · ASSINATURA", "Instante e signatário no campo visual abaixo", rightColumnX, EVIDENCE_BLOCKS.context.top + 78, rightColumnWidth);
  drawLabelValue(page, fonts, "TOKEN / MODALIDADE", manifest.signature.tokenType, leftColumnX, EVIDENCE_BLOCKS.context.top + 105, leftColumnWidth);
  drawLabelValue(page, fonts, "TIPO", signatureTypeLabel(manifest.signature), rightColumnX, EVIDENCE_BLOCKS.context.top + 105, rightColumnWidth);
  const location = manifest.signingEnvironment.geolocation
    ? `${manifest.signingEnvironment.geolocation.latitude}, ${manifest.signingEnvironment.geolocation.longitude} (±${manifest.signingEnvironment.geolocation.accuracyMeters} m)`
    : "Não fornecida pelo usuário";
  drawLabelValue(
    page,
    fonts,
    "AMBIENTE / IP / LOCALIZAÇÃO",
    `${manifest.signingEnvironment.platform} · ${manifest.signingEnvironment.locale} · ${manifest.signingEnvironment.timezone} · IP ${manifest.signingEnvironment.observedIp} · ${location}`,
    leftColumnX,
    EVIDENCE_BLOCKS.context.top + 130,
    BODY.width - 32,
    7.2,
  );

  drawPanel(page, EVIDENCE_BLOCKS.attributes, { accent: BLUE, opacity: 0.72 });
  if (icpBrasil && manifest.signature.optionalAttributes) {
    const optionalAttributes = manifest.signature.optionalAttributes;
    const optionalPolicy = `${optionalAttributes.normativeDocument} · AD-RB v1.3 · OID ${manifest.signature.policyOid}`;
    drawSectionHeading(page, fonts, "03", "ATRIBUTOS CONFIRMADOS NO PADES", EVIDENCE_BLOCKS.attributes, optionalPolicy);
    drawAttributeSignal(page, fonts, {
      label: optionalAttributes.assurance === "private-provider-enforced" ? "INCORPORADOS" : "PSC / CONFERIR",
      value: optionalAttributes.incorporated.join(" · "), top: EVIDENCE_BLOCKS.attributes.top + 38, color: GREEN,
    });
    drawAttributeSignal(page, fonts, {
      label: "ACT / CONDICIONAL", value: optionalAttributes.actConditional.join(" · "), top: EVIDENCE_BLOCKS.attributes.top + 54, color: GOLD,
    });
    drawAttributeSignal(page, fonts, {
      label: "CONTEXTO / PADRÃO", value: optionalAttributes.contextualOrDefault.join(" · "), top: EVIDENCE_BLOCKS.attributes.top + 70, color: MUTED,
    });
  } else {
    drawSectionHeading(page, fonts, "03", "ATRIBUTOS DA ASSINATURA", EVIDENCE_BLOCKS.attributes, manifest.signature.infrastructure);
    drawAttributeSignal(page, fonts, { label: "FORMATO", value: manifest.signature.format, top: EVIDENCE_BLOCKS.attributes.top + 38, color: BLUE });
    drawAttributeSignal(page, fonts, { label: "MODALIDADE", value: manifest.signature.profile, top: EVIDENCE_BLOCKS.attributes.top + 54, color: MUTED });
    drawAttributeSignal(page, fonts, { label: "INFRAESTRUTURA", value: manifest.signature.infrastructure, top: EVIDENCE_BLOCKS.attributes.top + 70, color: MUTED });
  }

  drawPanel(page, EVIDENCE_BLOCKS.pqc, { accent: BLUE, opacity: 0.74 });
  drawSectionHeading(page, fonts, "04", "ATESTADO PÓS-QUÂNTICO", EVIDENCE_BLOCKS.pqc);
  page.drawText(attestation.code, {
    x: EVIDENCE_BLOCKS.pqc.left + 12,
    y: baseline(EVIDENCE_BLOCKS.pqc.top + 31),
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

  drawPanel(page, EVIDENCE_BLOCKS.validation, { accent: GOLD, opacity: 0.78 });
  page.drawText("VALIDAR O ORIGINAL", {
    x: EVIDENCE_BLOCKS.validation.left + 10,
    y: baseline(EVIDENCE_BLOCKS.validation.top + 12),
    font: fonts.bold,
    size: 7.2,
    color: BLUE,
  });
  const validationIconX = EVIDENCE_BLOCKS.validation.left + 10;
  const validationTextX = EVIDENCE_BLOCKS.validation.left + 23;
  const validationTextSize = 7.2;
  drawLucideGlobe(page, { x: validationIconX, top: EVIDENCE_BLOCKS.validation.top + 20 });
  page.drawText(verificationHost, {
    x: validationTextX,
    y: baseline(EVIDENCE_BLOCKS.validation.top + 29),
    font: fonts.regular,
    size: validationTextSize,
    color: BLUE,
  });
  const verificationHostWidth = fonts.regular.widthOfTextAtSize(verificationHost, validationTextSize);
  addLink(document, page, {
    x: validationIconX,
    y: baseline(EVIDENCE_BLOCKS.validation.top + 32),
    width: validationTextX - validationIconX + verificationHostWidth,
    height: 10,
    url: verificationUrl,
  });
  if (itiValidationEligible) {
    const itiHost = "validar.iti.gov.br";
    const itiHostWidth = fonts.regular.widthOfTextAtSize(itiHost, validationTextSize);
    drawLucideGlobe(page, { x: validationIconX, top: EVIDENCE_BLOCKS.validation.top + 35 });
    page.drawText(itiHost, {
      x: validationTextX,
      y: baseline(EVIDENCE_BLOCKS.validation.top + 44),
      font: fonts.regular,
      size: validationTextSize,
      color: BLUE,
    });
    addLink(document, page, {
      x: validationIconX,
      y: baseline(EVIDENCE_BLOCKS.validation.top + 47),
      width: validationTextX - validationIconX + itiHostWidth,
      height: 10,
      url: ITI_VALIDATOR_URL,
    });
  }

  page.drawRectangle({ ...rect(EVIDENCE_BLOCKS.barcode), color: rgb(1, 1, 1), opacity: 0.7 });
  page.drawImage(barcode, {
    x: EVIDENCE_BLOCKS.barcode.left + 8,
    y: pdfY(EVIDENCE_BLOCKS.barcode.top + 3, 18),
    width: EVIDENCE_BLOCKS.barcode.width - 16,
    height: 18,
  });

  const signatureFrameRect = {
    x: SIGNATURE_FRAME.left,
    y: SIGNATURE_FRAME.bottom,
    width: SIGNATURE_FRAME.width,
    height: SIGNATURE_FRAME.height,
  };
  page.drawRectangle({
    ...signatureFrameRect,
    color: PAPER,
    opacity: 0.72,
  });
  page.drawRectangle({
    x: SIGNATURE_FRAME.left + SIGNATURE_FRAME.width - 112,
    y: SIGNATURE_FRAME.bottom,
    width: 112,
    height: SIGNATURE_FRAME.height,
    color: icpBrasil ? GREEN : BLUE,
    opacity: 0.045,
  });
  page.drawRectangle({
    x: SIGNATURE_FRAME.left + 8,
    y: SIGNATURE_FRAME.bottom + 9,
    width: 2.4,
    height: SIGNATURE_FRAME.height - 18,
    color: GOLD,
    opacity: 0.82,
  });
  page.drawText("05 · DADOS DO SIGNATÁRIO E ATRIBUTOS DA ASSINATURA", {
    x: SIGNATURE_FRAME.left + 16,
    y: SIGNATURE_FRAME.bottom + SIGNATURE_FRAME.height - 13,
    font: fonts.bold,
    size: 6.6,
    color: MUTED,
  });
  const credentialLabel = icpBrasil ? "CREDENCIAL ICP-BRASIL" : "CREDENCIAL PADES";
  page.drawText(credentialLabel, {
    x: SIGNATURE_FRAME.left + SIGNATURE_FRAME.width - 103,
    y: SIGNATURE_FRAME.bottom + SIGNATURE_FRAME.height - 13,
    font: fonts.bold,
    size: 6.1,
    color: icpBrasil ? GREEN : BLUE,
  });
  if (icpBrasil) {
    page.drawImage(icpLogo, {
      x: SIGNATURE_FRAME.left + SIGNATURE_FRAME.width - 103,
      y: SIGNATURE_FRAME.bottom + 31,
      width: 86,
      height: 29,
    });
  } else {
    drawPadesMark(page, fonts);
    const allSigners = Array.isArray(manifest.signers) ? manifest.signers : [];
    const visibleSigners = allSigners.slice(0, 4);
    if (visibleSigners.length === 0) {
      page.drawText("Signatário identificado na trilha de auditoria", {
        x: SIGNATURE_BOX.left,
        y: SIGNATURE_BOX.bottom + SIGNATURE_BOX.height - 16,
        font: fonts.regular,
        size: 7.4,
        color: MUTED,
      });
    } else {
      visibleSigners.forEach((signer, index) => {
        const signedAt = signer.signedAt ? formatDate(signer.signedAt) : "instante registrado na trilha";
        const value = `${signer.name} · ${signer.role} · ${signer.profile} · ${signedAt}`;
        page.drawText(fitText(fonts.regular, value, 7.2, SIGNATURE_BOX.width - 8), {
          x: SIGNATURE_BOX.left,
          y: SIGNATURE_BOX.bottom + SIGNATURE_BOX.height - 15 - index * 13,
          font: index === 0 ? fonts.bold : fonts.regular,
          size: 7.2,
          color: INK,
        });
      });
      if (allSigners.length > visibleSigners.length) {
        page.drawText(`+ ${allSigners.length - visibleSigners.length} signatário(s) na trilha de auditoria`, {
          x: SIGNATURE_BOX.left,
          y: SIGNATURE_BOX.bottom + 1,
          font: fonts.regular,
          size: 6.4,
          color: MUTED,
        });
      }
    }
  }

  const legalText = icpBrasil
    ? "MP 2.200-2/2001, art. 10, § 1º · L 14.063/2020, art. 4º, III."
    : manifest.signature.legalBasis;
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
  document.setCreator("Maiocchi. Assinatura");
  document.setProducer("Maiocchi. Assinatura");
  document.setKeywords([
    manifest.signature.format,
    manifest.signature.infrastructure,
    manifest.publicId,
    manifest.documentNumber,
    attestation.code,
  ]);
  document.setCreationDate(new Date(manifest.createdAt));
  document.setModificationDate(new Date(manifest.createdAt));
  await ensurePadesCatalog(document);

  const presentation = Buffer.from(await document.save({ useObjectStreams: false, addDefaultPage: false }));
  const sheetDocument = await PDFDocument.create({ updateMetadata: false });
  const [copied] = await sheetDocument.copyPages(document, [document.getPageCount() - 1]);
  sheetDocument.addPage(copied);
  sheetDocument.catalog.set(PDFName.of("Lang"), PDFString.of("pt-BR"));
  sheetDocument.setTitle(`Evidências da assinatura digital · ${manifest.publicId}`);
  sheetDocument.setAuthor("Maiocchi Advogado");
  sheetDocument.setSubject(`${manifest.signature.format} ${manifest.signature.infrastructure} · ${manifest.publicId}`);
  sheetDocument.setCreator("Maiocchi. Assinatura");
  sheetDocument.setProducer("Maiocchi. Assinatura");
  sheetDocument.setCreationDate(new Date(manifest.createdAt));
  sheetDocument.setModificationDate(new Date(manifest.createdAt));
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
