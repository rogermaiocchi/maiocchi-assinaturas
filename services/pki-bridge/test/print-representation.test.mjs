import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import test from "node:test";
import { createAuthenticitySheet } from "../src/print-representation.mjs";

test("gera folha A4 independente, de uma página e com metadados do escritório", async () => {
  const bytes = await createAuthenticitySheet({
    publicId: "MAI-2026-1111-1111-1111-1111",
    originalSha256: "a".repeat(64),
    revision: 3,
    finalizedAt: "2026-07-12T12:00:00.000Z",
    verifyUrl: "https://assinatura.maiocchi.adv.br/v/MAI-2026-1111-1111-1111-1111",
  });
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize();
  assert.ok(Math.abs(width - 595.28) < 0.01);
  assert.ok(Math.abs(height - 841.89) < 0.01);
  assert.equal(pdf.getAuthor(), "Maiocchi Advogado");
  assert.match(pdf.getTitle(), /MAI-2026-1111/i);
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
