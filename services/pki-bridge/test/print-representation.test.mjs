import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import test from "node:test";
import { createAuthenticitySheet } from "../src/print-representation.mjs";

test("gera folha A4 independente, de uma página e com metadados do escritório", async () => {
  const bytes = await createAuthenticitySheet({
    publicId: "MAI-2026-1111-1111-1111-1111",
    originalSha256: "a".repeat(64),
    revision: 3,
    finalizedAt: "2026-07-12T12:00:00.000Z",
    verifyUrl: "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-1111-1111-1111",
  });
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.01);
  assert.ok(Math.abs(height - 841.89) < 0.01);
  assert.equal(pdf.getAuthor(), "Maiocchi Advogado");
  assert.match(pdf.getTitle(), /MAI-2026-1111/i);
  const images = pdf.getPage(0).node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.equal(images.keys().length, 2, "a folha deve incorporar QR Code e código de barras");
  assert.ok(bytes.length > 20_000, "a folha deve conter os gráficos de conferência");
  const renderer = await readFile(new URL("../src/print-representation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(renderer, /Página \d+ de \d+/, "a representação independente não deve imprimir paginação");
});

test("rejeita metadados e URL fora do contrato", async () => {
  await assert.rejects(createAuthenticitySheet({
    publicId: "ID<script>",
    originalSha256: "a".repeat(64),
    revision: 1,
    finalizedAt: "2026-07-12T12:00:00.000Z",
    verifyUrl: "http://example.test/verify",
  }), /document ID has an invalid format/i);
});
