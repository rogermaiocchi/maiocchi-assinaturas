import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { assertSignedPdfBoundToPresentation } from "../src/signed-pdf-binding.mjs";
import { SIGNATURE_BOX } from "../src/pades-evidence-layout.mjs";
import {
  appendInjectedByteRangeAfterEof,
  simulatedSignedPdf,
} from "./helpers/signed-pdf-fixture.mjs";

async function onePagePdf({ width = 595.28, pages = 1 } = {}) {
  const document = await PDFDocument.create();
  document.setLanguage("pt-BR");
  for (let index = 0; index < pages; index += 1) document.addPage([width, 841.89]);
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

const isBindingMismatch = (error) => (
  error.status === 422 && error.code === "signed_document_mismatch"
);

const srgbProfile = await readFile(new URL("../assets/srgb.icc", import.meta.url));

async function twoPagePdfWithNamedDestination() {
  const document = await PDFDocument.create();
  const firstPage = document.addPage([595.28, 841.89]);
  const evidencePage = document.addPage([595.28, 841.89]);
  const destination = document.context.obj([evidencePage.ref, PDFName.of("Fit")]);
  document.catalog.set(PDFName.of("Names"), document.context.obj({
    Dests: document.context.obj({
      Names: document.context.obj([PDFString.of("evidence"), destination]),
    }),
  }));
  firstPage.drawText("Página com destino nomeado");
  evidencePage.drawText("Página de evidências");
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

test("vincula a única assinatura estrutural alcançável pelo AcroForm", async () => {
  const presentation = await onePagePdf();
  assert.deepEqual(await assertSignedPdfBoundToPresentation({
    presentation,
    signedPdf: await simulatedSignedPdf(presentation),
  }), { signatureCount: 1 });
});

test("aceita widget de assinatura cujo FT é herdado do campo pai", async () => {
  const presentation = await onePagePdf();
  await assert.doesNotReject(async () => assertSignedPdfBoundToPresentation({
    presentation,
    signedPdf: await simulatedSignedPdf(presentation, { inheritedFieldType: true }),
  }));
});

test("limita a aparência da assinatura à área reservada na última página", async () => {
  const presentation = await onePagePdf();
  const reservedRect = [
    SIGNATURE_BOX.left,
    SIGNATURE_BOX.bottom,
    SIGNATURE_BOX.left + SIGNATURE_BOX.width,
    SIGNATURE_BOX.bottom + SIGNATURE_BOX.height,
  ];
  await assert.doesNotReject(async () => assertSignedPdfBoundToPresentation({
    presentation,
    signedPdf: await simulatedSignedPdf(presentation, {
      attachWidgetToPage: true,
      widgetRect: reservedRect,
    }),
  }));
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(presentation, {
        attachWidgetToPage: true,
        widgetRect: [0, 0, 999, 999],
      }),
    }),
    isBindingMismatch,
  );
  const twoPagePresentation = await onePagePdf({ pages: 2 });
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation: twoPagePresentation,
      signedPdf: await simulatedSignedPdf(twoPagePresentation, {
        attachWidgetToPage: true,
        widgetRect: reservedRect,
      }),
    }),
    isBindingMismatch,
  );
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(presentation, {
        parentFieldOverrides: { AA: "<< /K << /S /JavaScript /JS (evil) >> >>" },
      }),
    }),
    isBindingMismatch,
  );
});

test("aceita somente os aprimoramentos exatos do DSS e trata páginas como limites semânticos", async () => {
  const presentation = await twoPagePdfWithNamedDestination();
  const reservedRect = [
    SIGNATURE_BOX.left,
    SIGNATURE_BOX.bottom,
    SIGNATURE_BOX.left + SIGNATURE_BOX.width,
    SIGNATURE_BOX.bottom + SIGNATURE_BOX.height,
  ];
  await assert.doesNotReject(async () => assertSignedPdfBoundToPresentation({
    presentation,
    signedPdf: await simulatedSignedPdf(presentation, {
      attachWidgetToPage: true,
      widgetPageIndex: 1,
      widgetRect: reservedRect,
      padesCatalogEnhancement: { profile: srgbProfile },
    }),
  }));

  const alteredProfile = Buffer.from(srgbProfile);
  alteredProfile[alteredProfile.length - 1] ^= 0x01;
  const oversizedProfile = Buffer.alloc((1024 * 1024) + 1);
  for (const padesCatalogEnhancement of [
    { profile: srgbProfile, extensionLevel: 9 },
    { profile: srgbProfile, outputCondition: "Perfil não autorizado" },
    { profile: srgbProfile, outputIntentExtra: "/Info (não autorizado)" },
    { profile: alteredProfile },
    { profile: oversizedProfile },
  ]) {
    await assert.rejects(
      async () => assertSignedPdfBoundToPresentation({
        presentation,
        signedPdf: await simulatedSignedPdf(presentation, {
          attachWidgetToPage: true,
          widgetPageIndex: 1,
          widgetRect: reservedRect,
          padesCatalogEnhancement,
        }),
      }),
      isBindingMismatch,
    );
  }
});

test("rejeita ByteRange textual sem assinatura estrutural e assinaturas estruturais duplicadas", async () => {
  const presentation = await onePagePdf();
  const textual = Buffer.concat([
    presentation,
    Buffer.from(`\n/ByteRange [0 ${presentation.length} ${presentation.length + 1} 8]\n/Contents <00>\n%%EOF\n`),
  ]);
  await assert.rejects(
    () => assertSignedPdfBoundToPresentation({ presentation, signedPdf: textual }),
    isBindingMismatch,
  );
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(presentation, { extraSignatureDictionary: true }),
    }),
    isBindingMismatch,
  );
});

test("rejeita Contents ausente ou vazio, SubFilter impróprio e cobertura truncada", async () => {
  const presentation = await onePagePdf();
  for (const options of [
    { includeContents: false },
    { contentsHex: "00".repeat(128) },
    { subFilter: "adbe.pkcs7.detached" },
    { coverWholeFile: false },
  ]) {
    await assert.rejects(
      async () => assertSignedPdfBoundToPresentation({
        presentation,
        signedPdf: await simulatedSignedPdf(presentation, options),
      }),
      isBindingMismatch,
    );
  }
});

test("rejeita substituição e mudanças semânticas nas páginas, catálogo ou formulário", async () => {
  const presentation = await onePagePdf();
  const replacement = await onePagePdf({ width: 612 });
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(replacement),
    }),
    isBindingMismatch,
  );
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(presentation, { alterPage: true }),
    }),
    isBindingMismatch,
  );
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(presentation, { alterCatalog: true }),
    }),
    isBindingMismatch,
  );
  await assert.rejects(
    async () => assertSignedPdfBoundToPresentation({
      presentation,
      signedPdf: await simulatedSignedPdf(presentation, { acroFormOverrides: { XFA: "(evil)" } }),
    }),
    isBindingMismatch,
  );
});

test("rejeita ByteRange integral injetado depois do EOF", async () => {
  const presentation = await onePagePdf();
  const incomplete = await simulatedSignedPdf(presentation, { coverWholeFile: false });
  const injected = appendInjectedByteRangeAfterEof(incomplete, presentation.length);
  await assert.rejects(
    () => assertSignedPdfBoundToPresentation({ presentation, signedPdf: injected }),
    isBindingMismatch,
  );
});
