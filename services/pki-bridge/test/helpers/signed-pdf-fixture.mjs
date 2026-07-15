import { PDFDocument } from "pdf-lib";

const BYTE_RANGE_MARKERS = ["1111111111", "2222222222", "3333333333"];
const DEFAULT_CONTENTS_HEX = `30${"ab".repeat(127)}`;

function fixedWidthInteger(value) {
  const rendered = String(value);
  if (!Number.isSafeInteger(value) || value < 0 || rendered.length > 10) {
    throw new RangeError("PDF fixture offset exceeds its reserved width");
  }
  return rendered.padStart(10, "0");
}

function previousXrefOffset(pdf) {
  const match = pdf.toString("latin1").match(/startxref\s+(\d+)\s+%%EOF[\x00\x09\x0a\x0c\x0d\x20]*$/);
  if (!match) throw new Error("PDF fixture requires a conventional final startxref section");
  return Number(match[1]);
}

function serializedDictionary(dictionary, { omit = new Set(), overrides = new Map() } = {}) {
  const entries = new Map(dictionary.entries()
    .filter(([key]) => !omit.has(key.toString()))
    .map(([key, value]) => [key.toString(), value.toString()]));
  for (const [key, value] of overrides) entries.set(key, value);
  return `<<\n${[...entries].map(([key, value]) => `${key} ${value}`).join("\n")}\n>>`;
}

function indirectObject({ number, generation = 0, value }) {
  return `${number} ${generation} obj\n${value}\nendobj\n`;
}

export async function simulatedSignedPdf(presentation, {
  alterCatalog = false,
  alterPage = false,
  acroFormOverrides = {},
  attachWidgetToPage = false,
  catalogOverrides = {},
  contentsHex = DEFAULT_CONTENTS_HEX,
  coverWholeFile = true,
  extraSignatureDictionary = false,
  includeContents = true,
  inheritedFieldType = false,
  pageOverrides = {},
  parentFieldOverrides = {},
  signatureCount = 1,
  subFilter = "ETSI.CAdES.detached",
  widgetRect = [0, 0, 0, 0],
} = {}) {
  const document = await PDFDocument.load(presentation, { updateMetadata: false });
  let nextObjectNumber = document.context.largestObjectNumber + 1;
  const catalogNumber = nextObjectNumber++;
  const acroFormNumber = nextObjectNumber++;
  const parentFieldNumber = nextObjectNumber++;
  const widgetNumber = nextObjectNumber++;
  const signatureNumber = nextObjectNumber++;
  const hasExtraSignature = extraSignatureDictionary || signatureCount > 1;
  const extraSignatureNumber = hasExtraSignature ? nextObjectNumber++ : undefined;

  const serializedCatalogOverrides = new Map([["/AcroForm", `${acroFormNumber} 0 R`]]);
  if (alterCatalog) serializedCatalogOverrides.set("/PageMode", "/UseOutlines");
  for (const [key, value] of Object.entries(catalogOverrides)) {
    serializedCatalogOverrides.set(`/${key}`, value);
  }
  const catalog = serializedDictionary(document.catalog, {
    omit: new Set(["/AcroForm"]),
    overrides: serializedCatalogOverrides,
  });

  const parentFieldEntries = [
    ...(inheritedFieldType ? ["/FT /Sig"] : []),
    "/T (Signature1)",
    `/Kids [ ${widgetNumber} 0 R ]`,
    ...Object.entries(parentFieldOverrides).map(([key, value]) => `/${key} ${value}`),
  ];
  const parentField = `<<\n${parentFieldEntries.join("\n")}\n>>`;
  const widgetFieldType = inheritedFieldType ? "" : "/FT /Sig\n";
  const widget = `<<\n/Type /Annot\n/Subtype /Widget\n${widgetFieldType}/Parent ${parentFieldNumber} 0 R\n/V ${signatureNumber} 0 R\n/Rect [ ${widgetRect.join(" ")} ]\n>>`;
  const contentsKey = includeContents ? "Contents" : "Padding";
  const normalizedSubFilter = subFilter.startsWith("/") ? subFilter.slice(1) : subFilter;
  const signature = `<<\n/Type /Sig\n/Filter /Adobe.PPKLite\n/SubFilter /${normalizedSubFilter}\n/ByteRange [ 0 ${BYTE_RANGE_MARKERS.join(" ")} ]\n/${contentsKey} <${contentsHex}>\n>>`;
  const acroFormEntries = [
    `/Fields [ ${parentFieldNumber} 0 R ]`,
    "/SigFlags 3",
    ...Object.entries(acroFormOverrides).map(([key, value]) => `/${key} ${value}`),
  ];

  const objects = [];
  if (alterPage || attachWidgetToPage || Object.keys(pageOverrides).length > 0) {
    const page = document.getPages()[0];
    const serializedPageOverrides = new Map(Object.entries(pageOverrides).map(([key, value]) => [`/${key}`, value]));
    if (alterPage) serializedPageOverrides.set("/MediaBox", "[ 0 0 300 300 ]");
    if (attachWidgetToPage) serializedPageOverrides.set("/Annots", `[ ${widgetNumber} 0 R ]`);
    objects.push({
      number: page.ref.objectNumber,
      generation: page.ref.generationNumber,
      value: serializedDictionary(page.node, {
        overrides: serializedPageOverrides,
      }),
    });
  }
  objects.push(
    { number: catalogNumber, value: catalog },
    { number: acroFormNumber, value: `<<\n${acroFormEntries.join("\n")}\n>>` },
    { number: parentFieldNumber, value: parentField },
    { number: widgetNumber, value: widget },
    { number: signatureNumber, value: signature },
  );
  if (extraSignatureNumber !== undefined) {
    objects.push({
      number: extraSignatureNumber,
      value: `<<\n/Type /Sig\n/SubFilter /ETSI.CAdES.detached\n/ByteRange [ 0 1 2 3 ]\n/Contents <30ab>\n>>`,
    });
  }

  let body = "\n";
  const offsets = new Map();
  for (const object of objects) {
    offsets.set(object.number, presentation.length + Buffer.byteLength(body, "latin1"));
    body += indirectObject(object);
  }

  const xrefOffset = presentation.length + Buffer.byteLength(body, "latin1");
  const xrefEntries = [...objects]
    .sort((left, right) => left.number - right.number)
    .map((object) => `${object.number} 1\n${fixedWidthInteger(offsets.get(object.number))} ${String(object.generation ?? 0).padStart(5, "0")} n \n`)
    .join("");
  const size = Math.max(document.context.largestObjectNumber, ...objects.map(({ number }) => number)) + 1;
  body += `xref\n${xrefEntries}trailer\n<<\n/Size ${size}\n/Root ${catalogNumber} 0 R\n/Prev ${previousXrefOffset(presentation)}\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const contentsToken = `<${contentsHex}>`;
  const contentsEntry = `/${contentsKey} ${contentsToken}`;
  const contentsEntryOffset = body.indexOf(contentsEntry);
  if (contentsEntryOffset < 0) throw new Error("PDF fixture lost its signature contents token");
  const firstLength = presentation.length + contentsEntryOffset + contentsEntry.indexOf("<");
  const secondOffset = firstLength + Buffer.byteLength(contentsToken, "latin1");
  const completeLength = presentation.length + Buffer.byteLength(body, "latin1");
  const completeSecondLength = completeLength - secondOffset;
  const secondLength = coverWholeFile ? completeSecondLength : Math.max(1, completeSecondLength - 1);

  body = body
    .replace(BYTE_RANGE_MARKERS[0], fixedWidthInteger(firstLength))
    .replace(BYTE_RANGE_MARKERS[1], fixedWidthInteger(secondOffset))
    .replace(BYTE_RANGE_MARKERS[2], fixedWidthInteger(secondLength));
  return Buffer.concat([presentation, Buffer.from(body, "latin1")]);
}

export function appendInjectedByteRangeAfterEof(pdf, presentationSize) {
  const marker = "0000000000";
  const prefixTemplate = `\n/ByteRange [0 ${marker} ${marker} ${marker}]\n/Contents `;
  const contents = `<${DEFAULT_CONTENTS_HEX}>`;
  const suffix = "\n%%EOF\n";
  const firstLength = pdf.length + Buffer.byteLength(prefixTemplate, "latin1");
  const secondOffset = firstLength + Buffer.byteLength(contents, "latin1");
  const secondLength = Buffer.byteLength(suffix, "latin1");
  if (firstLength < presentationSize) throw new Error("Injected ByteRange starts before the presentation");

  const values = [firstLength, secondOffset, secondLength].map(fixedWidthInteger);
  let index = 0;
  const prefix = prefixTemplate.replaceAll(marker, () => values[index++]);
  return Buffer.concat([
    pdf,
    Buffer.from(prefix, "latin1"),
    Buffer.from(contents, "latin1"),
    Buffer.from(suffix, "latin1"),
  ]);
}
