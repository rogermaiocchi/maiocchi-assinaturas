import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  PAGE_MARGINS,
  SIGNATURE_BOX,
  SIGNATURE_FRAME,
  buildEvidenceManifest,
  composePadesEvidence,
  inspectUnsignedPdf,
  isIcpBrasilSignature,
} from "../src/pades-evidence.mjs";
import { createPostQuantumSigner, verifyPostQuantumAttestation } from "../src/post-quantum-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function sourceDocument(pageCount = 2) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`Conteudo original ${index + 1}`, { x: 72, y: 700, font, size: 12 });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function manifestFor(source, pageCount = 2, infrastructure = "ICP-Brasil") {
  return buildEvidenceManifest({
    publicId: "MAI-2026-1111-2222-3333-4444",
    documentNumber: "20260713010000123456789012345",
    documentName: "relatorio.pdf",
    sourceSha256: sha256(source),
    sourceSize: source.length,
    sourcePageCount: pageCount,
    createdAt: "2026-07-13T01:00:00.000Z",
    documentContext: {
      intendedFor: "Cliente de teste",
      purpose: "Relatorio juridico ⚖️",
    },
    signingMetadata: {
      observedIp: "203.0.113.10",
      platform: "MacIntel · 1440x900",
      userAgent: "Browser de teste",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      geolocation: { latitude: -15.79389, longitude: -47.88278, accuracyMeters: 20 },
      capturedAt: "2026-07-13T01:00:00.000Z",
      tokenType: infrastructure === "ICP-Brasil" ? "Certificado ICP-Brasil A3 / token criptografico" : "Conta verificada",
      format: "PAdES",
      profile: infrastructure === "ICP-Brasil" ? "AD-RB" : "Avançada",
      infrastructure,
    },
  });
}

test("acrescenta pagina de evidencias e carimba todas as paginas antes do PAdES", async () => {
  const source = await sourceDocument();
  assert.deepEqual(await inspectUnsignedPdf(source), { pageCount: 2 });
  const manifest = manifestFor(source);
  const attestation = {
    algorithm: "ML-DSA-65", keyId: "ml-dsa-65-test",
    code: "PQC-MLDSA65-1111-2222-3333-4444", manifestSha256: sha256(JSON.stringify(manifest)),
  };
  const result = await composePadesEvidence({ sourcePdf: source, manifest, attestation });
  const composed = await PDFDocument.load(result.presentation);
  const sheet = await PDFDocument.load(result.evidencePage);
  assert.equal(composed.getPageCount(), 3);
  assert.equal(sheet.getPageCount(), 1);
  assert.equal(result.totalPages, 3);
  assert.deepEqual(result.signatureBox, SIGNATURE_BOX);
  assert.deepEqual(result.signatureFrame, SIGNATURE_FRAME);
  assert.deepEqual(result.pageMargins, PAGE_MARGINS);
  assert.deepEqual(PAGE_MARGINS, { top: 85.04, right: 56.69, bottom: 56.69, left: 85.04 });
  assert.equal(SIGNATURE_FRAME.left, PAGE_MARGINS.left);
  assert.ok(Math.abs(SIGNATURE_FRAME.width - (595.28 - PAGE_MARGINS.left - PAGE_MARGINS.right)) < 1e-9);
  for (const page of composed.getPages()) {
    const xObjects = page.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
    assert.ok(xObjects.keys().length >= 1, "cada página deve conter o micro logo marginal");
  }
  const evidence = composed.getPage(2);
  const evidenceImages = evidence.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.ok(evidenceImages.keys().length >= 5, "a folha ICP deve conter marca, QR, Code128, fundo PAdES e logo ICP-Brasil");
  const annotations = evidence.node.lookup(PDFName.of("Annots"), PDFArray);
  assert.equal(annotations.size(), 2, "QR e bloco textual devem ser links completos");
  assert.match(result.verificationUrl, /\/v\/MAI-2026-1111-2222-3333-4444$/);
  assert.equal(result.barcodeValue, "MAI|MAI-2026-1111-2222-3333-4444|R1");
  assert.equal(result.icpBrasilSealIncluded, true);
  assert.equal(isIcpBrasilSignature(manifest.signature), true);
  assert.equal(composed.getTitle(), "relatorio");
  assert.match(composed.getSubject(), /ICP-Brasil/);
  assert.match(composed.catalog.get(PDFName.of("Lang")).toString(), /pt-BR/);
  assert.equal(manifest.signature.policyOid, "2.16.76.1.7.1.11.1.3");
  assert.equal(manifest.signature.optionalAttributes.assurance, "private-provider-enforced");
  assert.deepEqual(manifest.signature.optionalAttributes.incorporated, [
    "signerAttr", "/Name", "/M", "/Location", "/Reason", "/ContactInfo", "/Prop_Build",
  ]);
  assert.deepEqual(manifest.signature.optionalAttributes.actConditional, [
    "contentTimeStamp", "signatureTimeStampToken", "Document Time-stamp",
  ]);
  assert.deepEqual(manifest.signature.optionalAttributes.contextualOrDefault, [
    "/Reference", "/Changes", "/V=0", "/Prop_AuthTime", "DSS", "VRI",
  ]);
  assert.doesNotMatch(manifest.purpose, /⚖/u);
});

test("omite sinais ICP-Brasil quando a modalidade não é ICP-Brasil", async () => {
  const source = await sourceDocument(1);
  const manifest = manifestFor(source, 1, "Assinatura eletrônica avançada");
  const attestation = {
    algorithm: "ML-DSA-65", keyId: "ml-dsa-65-test",
    code: "PQC-MLDSA65-1111-2222-3333-4444", manifestSha256: sha256(JSON.stringify(manifest)),
  };
  const result = await composePadesEvidence({ sourcePdf: source, manifest, attestation });
  const composed = await PDFDocument.load(result.presentation);
  const evidence = composed.getPage(1);
  const evidenceImages = evidence.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.equal(result.icpBrasilSealIncluded, false);
  assert.equal(isIcpBrasilSignature(manifest.signature), false);
  assert.equal(manifest.signature.policyOid, null);
  assert.equal(manifest.signature.optionalAttributes, null);
  assert.doesNotMatch(composed.getSubject(), /ICP-Brasil/);
  assert.equal(evidenceImages.keys().length, 3, "modalidade não ICP deve conter somente marca, QR e Code128");
});

test("recusa PDF que já contém ByteRange de assinatura", async () => {
  await assert.rejects(() => inspectUnsignedPdf(Buffer.from("%PDF-1.7\n/ByteRange [0 1 2 3]")), /already contains/);
});

test("atestado ML-DSA-65 é verificável e detecta alteração", { skip: (() => {
  try { generateKeyPairSync("ml-dsa-65"); return false; } catch { return "runtime sem ML-DSA-65"; }
})() }, () => {
  const { privateKey, publicKey } = generateKeyPairSync("ml-dsa-65");
  const signer = createPostQuantumSigner(privateKey);
  const manifest = { id: "MAI-2026-1111-2222-3333-4444", hash: "a".repeat(64) };
  const attestation = signer.attest(manifest);
  assert.equal(attestation.algorithm, "ML-DSA-65");
  assert.match(attestation.code, /^PQC-MLDSA65(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  assert.equal(verifyPostQuantumAttestation(manifest, attestation, publicKey), true);
  assert.equal(verifyPostQuantumAttestation({ ...manifest, hash: "b".repeat(64) }, attestation, publicKey), false);
  assert.throws(() => createPostQuantumSigner(privateKey, "ml-dsa-65-arbitrary"), /does not match/);
});
