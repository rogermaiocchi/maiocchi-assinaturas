import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  PDFStream,
} from "pdf-lib";
import { PkiProviderError } from "./errors.mjs";
import { SIGNATURE_BOX } from "./pades-evidence-layout.mjs";

const MAX_SIGNATURE_GAP_BYTES = 4 * 1024 * 1024;
const REQUIRED_SUBFILTER = "/ETSI.CAdES.detached";
const EMPTY_KEYS = new Set();
const PAGE_IGNORED_KEYS = new Set(["/Annots", "/Parent"]);
const ANNOTATION_IGNORED_KEYS = new Set(["/P", "/Parent"]);
const CATALOG_IGNORED_KEYS = new Set(["/AcroForm", "/Pages", "/Extensions", "/OutputIntents"]);
const ACROFORM_IGNORED_KEYS = new Set(["/Fields", "/SigFlags"]);
const ACTIVE_FIELD_KEYS = new Set(["/A", "/AA"]);
const ADBE_EXTENSION_IGNORED_KEYS = new Set(["/ADBE"]);
const EXPECTED_ADBE_EXTENSION_KEYS = new Set(["/BaseVersion", "/ExtensionLevel"]);
const EXPECTED_OUTPUT_INTENT_KEYS = new Set([
  "/DestOutputProfile",
  "/OutputCondition",
  "/OutputConditionIdentifier",
  "/S",
  "/Type",
]);
const EXPECTED_ICC_STREAM_KEYS = new Set(["/Filter", "/Length", "/N"]);
const EXPECTED_SRGB_ICC_SHA256 = "87e382b9336e6a0417a4d860173109ab319a029cf2972e19833a3327c65bd7e4";
const MAX_COMPRESSED_ICC_BYTES = 64 * 1024;
const MAX_ICC_PROFILE_BYTES = 1024 * 1024;
const PDF_WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const RECT_TOLERANCE_POINTS = 0.5;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function providerMismatch(message) {
  return new PkiProviderError(message, { status: 422, code: "signed_document_mismatch" });
}

function resolvedName(value, context) {
  const resolved = context.lookup(value);
  return resolved instanceof PDFName ? resolved.asString() : null;
}

function inheritableFieldAttribute(field, key, context) {
  const visited = new Set();
  let current = field;
  while (current) {
    if (visited.has(current)) throw providerMismatch("Signed PDF contains a cyclic AcroForm field hierarchy");
    visited.add(current);
    const value = current.get(key);
    if (value !== undefined) return value;
    const parentValue = current.get(PDFName.of("Parent"));
    if (parentValue === undefined) return undefined;
    const parent = context.lookup(parentValue);
    if (!(parent instanceof PDFDict)) {
      throw providerMismatch("Signed PDF contains an invalid AcroForm field parent");
    }
    current = parent;
  }
  return undefined;
}

function isSignatureDictionary(dictionary, context) {
  return dictionary instanceof PDFDict
    && resolvedName(dictionary.get(PDFName.of("Type")), context) === "/Sig";
}

function allSignatureDictionaries(context) {
  const signatures = new Set();
  const visited = new Set();

  function visit(object) {
    if (object instanceof PDFRef || object === undefined) return;
    if (!(object instanceof PDFArray) && !(object instanceof PDFDict) && !(object instanceof PDFStream)) return;
    if (visited.has(object)) return;
    visited.add(object);

    if (object instanceof PDFStream) {
      visit(object.dict);
      return;
    }
    if (object instanceof PDFArray) {
      for (const value of object.asArray()) visit(value);
      return;
    }
    if (isSignatureDictionary(object, context)) signatures.add(object);
    for (const [, value] of object.entries()) visit(value);
  }

  for (const [, object] of context.enumerateIndirectObjects()) visit(object);
  return signatures;
}

function reachableAcroFormSignatures(document) {
  const context = document.context;
  const acroForm = context.lookup(document.catalog.get(PDFName.of("AcroForm")));
  if (!(acroForm instanceof PDFDict)) {
    throw providerMismatch("Signed PDF does not contain an AcroForm signature field");
  }
  const fields = context.lookup(acroForm.get(PDFName.of("Fields")));
  if (!(fields instanceof PDFArray)) {
    throw providerMismatch("Signed PDF does not contain a valid AcroForm Fields array");
  }

  const signatures = new Set();
  const signatureFields = new Set();
  const visited = new Set();
  const active = new Set();

  function visit(fieldValue, depth) {
    if (depth > 64) throw providerMismatch("Signed PDF AcroForm field hierarchy is too deep");
    const field = context.lookup(fieldValue);
    if (!(field instanceof PDFDict)) {
      throw providerMismatch("Signed PDF contains a non-dictionary AcroForm field");
    }
    if (active.has(field) || visited.has(field)) {
      throw providerMismatch("Signed PDF contains a cyclic or duplicated AcroForm field");
    }
    active.add(field);
    visited.add(field);

    const fieldTypeValue = inheritableFieldAttribute(field, PDFName.of("FT"), context);
    const fieldType = fieldTypeValue === undefined ? null : resolvedName(fieldTypeValue, context);
    if (fieldTypeValue !== undefined && fieldType === null) {
      throw providerMismatch("Signed PDF contains an invalid AcroForm field type");
    }
    if (fieldType === "/Sig") {
      const signatureValue = inheritableFieldAttribute(field, PDFName.of("V"), context);
      if (signatureValue !== undefined) {
        const signature = context.lookup(signatureValue);
        if (!isSignatureDictionary(signature, context)) {
          throw providerMismatch("Signed PDF signature field does not reference a signature dictionary");
        }
        signatureFields.add(field);
        signatures.add(signature);
      }
    }

    const kidsValue = field.get(PDFName.of("Kids"));
    if (kidsValue !== undefined) {
      const kids = context.lookup(kidsValue);
      if (!(kids instanceof PDFArray)) {
        throw providerMismatch("Signed PDF contains an invalid AcroForm Kids array");
      }
      for (const kid of kids.asArray()) visit(kid, depth + 1);
    }
    active.delete(field);
  }

  for (const field of fields.asArray()) visit(field, 0);
  return { signatures, signatureFields };
}

function validatedSignature(document) {
  const context = document.context;
  const reachable = reachableAcroFormSignatures(document);
  const all = allSignatureDictionaries(context);
  if (reachable.signatures.size !== 1 || all.size !== 1) {
    throw providerMismatch("Signed PDF must contain exactly one structural signature dictionary");
  }
  const [dictionary] = reachable.signatures;
  if (!all.has(dictionary)) {
    throw providerMismatch("Signed PDF signature dictionary is not reachable from AcroForm Fields");
  }

  const subFilter = dictionary.get(PDFName.of("SubFilter"));
  if (!(subFilter instanceof PDFName) || subFilter.asString() !== REQUIRED_SUBFILTER) {
    throw providerMismatch(`Signed PDF signature must use ${REQUIRED_SUBFILTER}`);
  }
  const contents = dictionary.get(PDFName.of("Contents"));
  if (!(contents instanceof PDFHexString)) {
    throw providerMismatch("Signed PDF signature must contain a direct hexadecimal Contents value");
  }
  const compactContents = contents.asString().replace(/[\x00\x09\x0a\x0c\x0d\x20]/g, "");
  if (compactContents.length === 0
      || compactContents.length % 2 !== 0
      || !/^[0-9a-fA-F]+$/.test(compactContents)
      || !Buffer.from(compactContents, "hex").some((value) => value !== 0)) {
    throw providerMismatch("Signed PDF signature Contents is empty or malformed");
  }

  const byteRange = dictionary.get(PDFName.of("ByteRange"));
  if (!(byteRange instanceof PDFArray) || byteRange.size() !== 4) {
    throw providerMismatch("Signed PDF signature must contain one four-value ByteRange");
  }
  const values = byteRange.asArray().map((value) => (
    value instanceof PDFNumber ? value.asNumber() : Number.NaN
  ));
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw providerMismatch("Signed PDF signature ByteRange is malformed");
  }
  const visibleSignatureWidgets = new Set();
  for (const field of reachable.signatureFields) {
    const widget = signatureWidgetDetails(field, context, reachable.signatureFields);
    if (widget?.visible) visibleSignatureWidgets.add(widget.dictionary);
  }
  if (visibleSignatureWidgets.size > 1) {
    throw providerMismatch("Signed PDF contains more than one visible signature widget");
  }
  return {
    dictionary,
    contents,
    byteRange: values,
    signatureFields: reachable.signatureFields,
    visibleSignatureWidgets,
  };
}

function endsAtPdfEof(pdf) {
  let end = pdf.length;
  while (end > 0 && PDF_WHITESPACE.has(pdf[end - 1])) end -= 1;
  return end >= 5 && pdf.subarray(end - 5, end).equals(Buffer.from("%%EOF", "ascii"));
}

function hasWholeFileCoverage(pdf, presentationSize, signature) {
  const [firstOffset, firstLength, secondOffset, secondLength] = signature.byteRange;
  if (
    firstOffset !== 0
    || firstLength < presentationSize
    || firstLength >= secondOffset
    || secondOffset - firstLength > MAX_SIGNATURE_GAP_BYTES
    || secondLength <= 0
    || secondOffset + secondLength !== pdf.length
    || !endsAtPdfEof(pdf)
  ) return false;

  const serializedContents = Buffer.from(signature.contents.toString(), "latin1");
  if (
    serializedContents.length !== secondOffset - firstLength
    || !pdf.subarray(firstLength, secondOffset).equals(serializedContents)
    || pdf.indexOf(serializedContents) !== firstLength
    || pdf.indexOf(serializedContents, firstLength + 1) !== -1
  ) return false;
  return true;
}

function canonicalObject(object, context, {
  ignoredKeys = EMPTY_KEYS,
  terminalReferences = EMPTY_KEYS,
  visiting = new Set(),
} = {}) {
  if (object === undefined) return null;
  if (object instanceof PDFRef) {
    const reference = object.toString();
    if (terminalReferences.has(reference)) return ["ref", reference];
    if (visiting.has(reference)) return ["cycle", reference];
    const next = new Set(visiting);
    next.add(reference);
    return ["ref", reference, canonicalObject(context.lookup(object), context, {
      ignoredKeys,
      terminalReferences,
      visiting: next,
    })];
  }
  if (object instanceof PDFStream) {
    return [
      "stream",
      canonicalObject(object.dict, context, { ignoredKeys, terminalReferences, visiting }),
      sha256(object.getContents()),
    ];
  }
  if (object instanceof PDFDict) {
    return ["dict", ...object.entries()
      .filter(([key]) => !ignoredKeys.has(key.toString()))
      .sort(([left], [right]) => left.toString().localeCompare(right.toString()))
      .map(([key, value]) => [
        key.toString(),
        canonicalObject(value, context, {
          ignoredKeys: EMPTY_KEYS,
          terminalReferences,
          visiting,
        }),
      ])];
  }
  if (object instanceof PDFArray) {
    return ["array", ...object.asArray().map((value) => (
      canonicalObject(value, context, { ignoredKeys, terminalReferences, visiting })
    ))];
  }
  return [object.constructor.name, object.toString()];
}

function objectDigest(object, context, options) {
  return sha256(Buffer.from(JSON.stringify(canonicalObject(object, context, options)), "utf8"));
}

function classifyFieldTree(fieldValue, context, signatureFields, visiting = new Set()) {
  const field = context.lookup(fieldValue);
  if (!(field instanceof PDFDict)) {
    throw providerMismatch("Signed PDF contains a non-dictionary AcroForm field");
  }
  if (visiting.has(field)) {
    throw providerMismatch("Signed PDF contains a cyclic AcroForm field hierarchy");
  }
  const kidsValue = field.get(PDFName.of("Kids"));
  const children = [];
  if (kidsValue !== undefined) {
    const kids = context.lookup(kidsValue);
    if (!(kids instanceof PDFArray)) {
      throw providerMismatch("Signed PDF contains an invalid AcroForm Kids array");
    }
    const next = new Set(visiting);
    next.add(field);
    for (const kid of kids.asArray()) {
      children.push(classifyFieldTree(kid, context, signatureFields, next));
    }
  }

  const fieldTypeValue = inheritableFieldAttribute(field, PDFName.of("FT"), context);
  const fieldType = fieldTypeValue === undefined ? null : resolvedName(fieldTypeValue, context);
  if (fieldTypeValue !== undefined && fieldType === null) {
    throw providerMismatch("Signed PDF contains an invalid AcroForm field type");
  }
  const isSignature = signatureFields.has(field);
  const hasSignature = isSignature || children.some((child) => child.hasSignature);
  const hasNonSignature = children.some((child) => child.hasNonSignature)
    || (!isSignature && ((fieldType !== null && fieldType !== "/Sig") || children.length === 0));
  const hasActiveAction = field.entries().some(([key]) => ACTIVE_FIELD_KEYS.has(key.toString()))
    || children.some((child) => child.hasActiveAction);
  return { hasSignature, hasNonSignature, hasActiveAction };
}

function acroFormFingerprint(document, signatureFields, terminalReferences) {
  const context = document.context;
  const acroFormValue = document.catalog.get(PDFName.of("AcroForm"));
  if (acroFormValue === undefined) return { properties: ["dict"], fields: [] };

  const acroForm = context.lookup(acroFormValue);
  if (!(acroForm instanceof PDFDict)) {
    throw providerMismatch("PDF contains an invalid AcroForm dictionary");
  }
  const properties = canonicalObject(acroForm, context, {
    ignoredKeys: ACROFORM_IGNORED_KEYS,
    terminalReferences,
  });
  const fieldsValue = acroForm.get(PDFName.of("Fields"));
  if (fieldsValue === undefined) return { properties, fields: [] };

  const fieldsArray = context.lookup(fieldsValue);
  if (!(fieldsArray instanceof PDFArray)) {
    throw providerMismatch("PDF contains an invalid AcroForm Fields array");
  }
  const fields = [];
  for (const fieldValue of fieldsArray.asArray()) {
    const classification = classifyFieldTree(fieldValue, context, signatureFields);
    if (classification.hasSignature) {
      if (classification.hasNonSignature || classification.hasActiveAction) {
        throw providerMismatch("Signed PDF mixed the signature with an existing or active AcroForm field");
      }
      continue;
    }
    fields.push(objectDigest(fieldValue, context, { terminalReferences }));
  }
  return { properties, fields };
}

function signatureWidgetDetails(object, context, signatureFields) {
  const dictionary = context.lookup(object);
  if (!(dictionary instanceof PDFDict) || !signatureFields.has(dictionary)) return null;
  const subtype = resolvedName(dictionary.get(PDFName.of("Subtype")), context);
  const fieldType = resolvedName(
    inheritableFieldAttribute(dictionary, PDFName.of("FT"), context),
    context,
  );
  if (subtype !== "/Widget" || fieldType !== "/Sig") return null;

  const rect = context.lookup(dictionary.get(PDFName.of("Rect")));
  if (!(rect instanceof PDFArray) || rect.size() !== 4) {
    throw providerMismatch("Signed PDF signature widget has an invalid rectangle");
  }
  const coordinates = rect.asArray().map((value) => {
    const number = context.lookup(value);
    return number instanceof PDFNumber ? number.asNumber() : Number.NaN;
  });
  if (!coordinates.every(Number.isFinite)) {
    throw providerMismatch("Signed PDF signature widget has an invalid rectangle");
  }
  const invisible = coordinates.every((value) => Math.abs(value) <= RECT_TOLERANCE_POINTS);
  const expected = [
    SIGNATURE_BOX.left,
    SIGNATURE_BOX.bottom,
    SIGNATURE_BOX.left + SIGNATURE_BOX.width,
    SIGNATURE_BOX.bottom + SIGNATURE_BOX.height,
  ];
  const reserved = coordinates.every((value, index) => (
    Math.abs(value - expected[index]) <= RECT_TOLERANCE_POINTS
  ));
  if (!invisible && !reserved) {
    throw providerMismatch("Signed PDF signature widget is outside the reserved evidence area");
  }
  return { dictionary, visible: reserved };
}

function nonSignatureAnnotations(
  page,
  signatureFields,
  pageIndex,
  lastPageIndex,
  attachedVisibleWidgets,
  terminalReferences,
) {
  const annotations = page.node.Annots();
  if (!annotations) return [];
  const fingerprints = [];
  for (const annotation of annotations.asArray()) {
    const widget = signatureWidgetDetails(annotation, page.doc.context, signatureFields);
    if (widget) {
      if (widget.visible) {
        if (pageIndex !== lastPageIndex) {
          throw providerMismatch("Signed PDF placed the visible signature outside the evidence page");
        }
        attachedVisibleWidgets.add(widget.dictionary);
      }
      continue;
    }
    fingerprints.push(objectDigest(annotation, page.doc.context, {
      ignoredKeys: ANNOTATION_IGNORED_KEYS,
      terminalReferences,
    }));
  }
  return fingerprints.sort();
}

function pageFingerprint(
  page,
  signatureFields,
  pageIndex,
  lastPageIndex,
  attachedVisibleWidgets,
  terminalReferences,
) {
  const context = page.doc.context;
  const inheritedKeys = ["Resources", "MediaBox", "CropBox", "Rotate", "UserUnit"];
  return sha256(Buffer.from(JSON.stringify({
    direct: canonicalObject(page.node, context, {
      ignoredKeys: PAGE_IGNORED_KEYS,
      terminalReferences,
    }),
    inherited: inheritedKeys.map((key) => [
      key,
      canonicalObject(page.node.getInheritableAttribute(PDFName.of(key)), context, { terminalReferences }),
    ]),
    annotations: nonSignatureAnnotations(
      page,
      signatureFields,
      pageIndex,
      lastPageIndex,
      attachedVisibleWidgets,
      terminalReferences,
    ),
  }), "utf8"));
}

function semanticFingerprint(document, signatureFields = new Set(), visibleSignatureWidgets = new Set()) {
  const pages = document.getPages();
  const pageReferences = pages.map((page) => page.ref.toString());
  const terminalReferences = new Set(pageReferences);
  const attachedVisibleWidgets = new Set();
  const pageFingerprints = pages.map((page, index) => pageFingerprint(
    page,
    signatureFields,
    index,
    pages.length - 1,
    attachedVisibleWidgets,
    terminalReferences,
  ));
  if (visibleSignatureWidgets.size !== attachedVisibleWidgets.size
      || [...visibleSignatureWidgets].some((widget) => !attachedVisibleWidgets.has(widget))) {
    throw providerMismatch("Signed PDF visible signature widget is not attached to the evidence page");
  }
  return {
    catalog: objectDigest(document.catalog, document.context, {
      ignoredKeys: CATALOG_IGNORED_KEYS,
      terminalReferences,
    }),
    acroForm: acroFormFingerprint(document, signatureFields, terminalReferences),
    pageReferences,
    pages: pageFingerprints,
  };
}

function hasExactDictionaryKeys(dictionary, expected) {
  const keys = dictionary.entries().map(([key]) => key.toString());
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function equivalentObjects(left, leftContext, right, rightContext, options) {
  return JSON.stringify(canonicalObject(left, leftContext, options))
    === JSON.stringify(canonicalObject(right, rightContext, options));
}

function expectedAdbeExtension(value, context) {
  const dictionary = context.lookup(value);
  if (!(dictionary instanceof PDFDict) || !hasExactDictionaryKeys(dictionary, EXPECTED_ADBE_EXTENSION_KEYS)) {
    return false;
  }
  const baseVersion = context.lookup(dictionary.get(PDFName.of("BaseVersion")));
  const extensionLevel = context.lookup(dictionary.get(PDFName.of("ExtensionLevel")));
  return baseVersion instanceof PDFName
    && baseVersion.asString() === "/1.7"
    && extensionLevel instanceof PDFNumber
    && extensionLevel.asNumber() === 8;
}

function assertPermittedDeveloperExtension(preparedDocument, signedDocument) {
  const key = PDFName.of("Extensions");
  const preparedValue = preparedDocument.catalog.get(key);
  const signedValue = signedDocument.catalog.get(key);
  if (preparedValue === undefined && signedValue === undefined) return;
  if (signedValue === undefined) {
    throw providerMismatch("Signed PDF removed the prepared developer extensions");
  }

  const signedDictionary = signedDocument.context.lookup(signedValue);
  if (!(signedDictionary instanceof PDFDict)) {
    throw providerMismatch("Signed PDF contains an invalid developer extensions dictionary");
  }
  if (preparedValue === undefined) {
    if (signedDictionary.entries().length !== 1
        || !expectedAdbeExtension(signedDictionary.get(PDFName.of("ADBE")), signedDocument.context)) {
      throw providerMismatch("Signed PDF added an unexpected developer extension");
    }
    return;
  }

  if (equivalentObjects(
    preparedValue,
    preparedDocument.context,
    signedValue,
    signedDocument.context,
  )) return;

  const preparedDictionary = preparedDocument.context.lookup(preparedValue);
  if (!(preparedDictionary instanceof PDFDict)
      || !equivalentObjects(
        preparedDictionary,
        preparedDocument.context,
        signedDictionary,
        signedDocument.context,
        { ignoredKeys: ADBE_EXTENSION_IGNORED_KEYS },
      )
      || preparedDictionary.has(PDFName.of("ADBE"))
      || !expectedAdbeExtension(signedDictionary.get(PDFName.of("ADBE")), signedDocument.context)) {
    throw providerMismatch("Signed PDF changed the prepared developer extensions");
  }
}

function decodedText(value, context) {
  const resolved = context.lookup(value);
  return resolved instanceof PDFString || resolved instanceof PDFHexString
    ? resolved.decodeText()
    : null;
}

function expectedSrgbProfile(value, context) {
  const stream = context.lookup(value);
  if (!(stream instanceof PDFStream) || !hasExactDictionaryKeys(stream.dict, EXPECTED_ICC_STREAM_KEYS)) {
    return false;
  }
  const filter = context.lookup(stream.dict.get(PDFName.of("Filter")));
  const components = context.lookup(stream.dict.get(PDFName.of("N")));
  const length = context.lookup(stream.dict.get(PDFName.of("Length")));
  const compressed = Buffer.from(stream.getContents());
  if (!(filter instanceof PDFName)
      || filter.asString() !== "/FlateDecode"
      || !(components instanceof PDFNumber)
      || components.asNumber() !== 3
      || !(length instanceof PDFNumber)
      || length.asNumber() !== compressed.length
      || compressed.length > MAX_COMPRESSED_ICC_BYTES) return false;

  let profile;
  try {
    profile = inflateSync(compressed, { maxOutputLength: MAX_ICC_PROFILE_BYTES });
  } catch {
    return false;
  }
  return profile.length >= 128
    && profile.length <= MAX_ICC_PROFILE_BYTES
    && profile.readUInt32BE(0) === profile.length
    && profile.subarray(12, 16).toString("ascii") === "mntr"
    && profile.subarray(16, 20).toString("ascii") === "RGB "
    && profile.subarray(20, 24).toString("ascii") === "XYZ "
    && profile.subarray(36, 40).toString("ascii") === "acsp"
    && sha256(profile) === EXPECTED_SRGB_ICC_SHA256;
}

function expectedSrgbOutputIntent(value, context) {
  const dictionary = context.lookup(value);
  if (!(dictionary instanceof PDFDict) || !hasExactDictionaryKeys(dictionary, EXPECTED_OUTPUT_INTENT_KEYS)) {
    return false;
  }
  return resolvedName(dictionary.get(PDFName.of("Type")), context) === "/OutputIntent"
    && resolvedName(dictionary.get(PDFName.of("S")), context) === "/GTS_PDFA1"
    && decodedText(dictionary.get(PDFName.of("OutputCondition")), context) === "sRGB"
    && decodedText(dictionary.get(PDFName.of("OutputConditionIdentifier")), context) === "sRGB"
    && expectedSrgbProfile(dictionary.get(PDFName.of("DestOutputProfile")), context);
}

function assertPermittedOutputIntent(preparedDocument, signedDocument) {
  const key = PDFName.of("OutputIntents");
  const preparedValue = preparedDocument.catalog.get(key);
  const signedValue = signedDocument.catalog.get(key);
  if (preparedValue === undefined && signedValue === undefined) return;
  if (signedValue === undefined) {
    throw providerMismatch("Signed PDF removed the prepared output intent");
  }
  if (preparedValue !== undefined) {
    if (equivalentObjects(
      preparedValue,
      preparedDocument.context,
      signedValue,
      signedDocument.context,
    )) return;

    const preparedOutputIntents = preparedDocument.context.lookup(preparedValue);
    const signedOutputIntents = signedDocument.context.lookup(signedValue);
    if (preparedOutputIntents instanceof PDFArray
        && preparedOutputIntents.size() === 0
        && signedOutputIntents instanceof PDFArray
        && signedOutputIntents.size() === 1
        && expectedSrgbOutputIntent(signedOutputIntents.get(0), signedDocument.context)) return;
    throw providerMismatch("Signed PDF changed the prepared output intent");
  }

  const outputIntents = signedDocument.context.lookup(signedValue);
  if (!(outputIntents instanceof PDFArray)
      || outputIntents.size() !== 1
      || !expectedSrgbOutputIntent(outputIntents.get(0), signedDocument.context)) {
    throw providerMismatch("Signed PDF added an unexpected output intent");
  }
}

function assertPermittedCatalogEnhancements(preparedDocument, signedDocument) {
  assertPermittedDeveloperExtension(preparedDocument, signedDocument);
  assertPermittedOutputIntent(preparedDocument, signedDocument);
}

export async function assertSignedPdfBoundToPresentation({ presentation, signedPdf }) {
  if (!Buffer.isBuffer(presentation) || !Buffer.isBuffer(signedPdf)) {
    throw new TypeError("presentation and signedPdf must be buffers");
  }
  if (signedPdf.length <= presentation.length || !signedPdf.subarray(0, presentation.length).equals(presentation)) {
    throw providerMismatch("Signed PDF is not an incremental revision of the prepared document");
  }

  try {
    const [preparedDocument, signedDocument] = await Promise.all([
      PDFDocument.load(presentation, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false }),
      PDFDocument.load(signedPdf, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false }),
    ]);
    const signature = validatedSignature(signedDocument);
    if (!hasWholeFileCoverage(signedPdf, presentation.length, signature)) {
      throw providerMismatch("Signed PDF does not cover exactly its signature Contents gap through final EOF");
    }
    assertPermittedCatalogEnhancements(preparedDocument, signedDocument);
    const preparedSemantics = semanticFingerprint(preparedDocument);
    const signedSemantics = semanticFingerprint(
      signedDocument,
      signature.signatureFields,
      signature.visibleSignatureWidgets,
    );
    if (JSON.stringify(preparedSemantics) !== JSON.stringify(signedSemantics)) {
      throw providerMismatch("Signed PDF changed the prepared document pages, catalog, or form fields");
    }
    return { signatureCount: 1 };
  } catch (error) {
    if (error instanceof PkiProviderError) throw error;
    throw providerMismatch("Signed PDF could not be structurally compared with the prepared document");
  }
}

export const signedPdfBindingInternals = {
  allSignatureDictionaries,
  hasWholeFileCoverage,
  reachableAcroFormSignatures,
  semanticFingerprint,
  validatedSignature,
};
