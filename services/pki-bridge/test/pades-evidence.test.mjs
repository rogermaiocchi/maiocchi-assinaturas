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
  isItiValidationEligible,
} from "../src/pades-evidence.mjs";
import { createPostQuantumSigner, verifyPostQuantumAttestation } from "../src/post-quantum-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function annotationUris(page) {
  const annotations = page.node.lookup(PDFName.of("Annots"), PDFArray);
  return Array.from({ length: annotations.size() }, (_, index) => {
    const annotation = annotations.lookup(index, PDFDict);
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    return action.get(PDFName.of("URI")).decodeText();
  });
}

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

test("acrescenta evidências, registra apenas páginas de conteúdo e vincula o VALIDAR ITI", async () => {
  const source = await sourceDocument();
  assert.deepEqual(await inspectUnsignedPdf(source), { pageCount: 2 });
  const manifest = manifestFor(source);
  const attestation = {
    algorithm: "ML-DSA-65", keyId: "ml-dsa-65-test",
    code: "PQC-MLDSA65-1111-2222-3333-4444", manifestSha256: sha256(JSON.stringify(manifest)),
  };
  const result = await composePadesEvidence({ sourcePdf: source, manifest, attestation });
  const composed = await PDFDocument.load(result.presentation, { updateMetadata: false });
  const sheet = await PDFDocument.load(result.evidencePage, { updateMetadata: false });
  assert.equal(composed.getPageCount(), 3);
  assert.equal(sheet.getPageCount(), 1);
  assert.equal(result.totalPages, 3);
  assert.deepEqual(result.signatureBox, SIGNATURE_BOX);
  assert.deepEqual(result.signatureFrame, SIGNATURE_FRAME);
  assert.deepEqual(result.pageMargins, PAGE_MARGINS);
  assert.deepEqual(PAGE_MARGINS, { top: 85.04, right: 56.69, bottom: 56.69, left: 85.04 });
  assert.equal(SIGNATURE_FRAME.left, PAGE_MARGINS.left);
  assert.ok(Math.abs(SIGNATURE_FRAME.width - (595.28 - PAGE_MARGINS.left - PAGE_MARGINS.right)) < 1e-9);
  assert.equal(SIGNATURE_FRAME.bottom, 91.89);
  assert.equal(SIGNATURE_BOX.bottom, SIGNATURE_FRAME.bottom + 15);
  for (const contentPage of composed.getPages().slice(0, -1)) {
    const xObjects = contentPage.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
    assert.equal(xObjects.keys().length, 1, "cada página original deve conter somente o micro logo marginal");
  }
  const evidence = composed.getPage(2);
  const evidenceImages = evidence.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
  assert.equal(evidenceImages.keys().length, 4, "a folha ICP deve conter QR, Code128, fundo de segurança e logo ICP-Brasil");
  const annotations = evidence.node.lookup(PDFName.of("Annots"), PDFArray);
  assert.equal(annotations.size(), 3, "QR, bloco textual e VALIDAR ITI devem ser links completos");
  assert.deepEqual(annotationUris(evidence).sort(), [
    "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-2222-3333-4444",
    "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-2222-3333-4444",
    "https://validar.iti.gov.br/",
  ].sort());
  assert.equal(result.verificationUrl, "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-2222-3333-4444");
  assert.equal(result.barcodeValue, "MAI|MAI-2026-1111-2222-3333-4444|R1");
  assert.equal(result.icpBrasilSealIncluded, true);
  assert.equal(result.visualSealMark, "ICP-Brasil");
  assert.equal(result.itiValidatorUrl, "https://validar.iti.gov.br/");
  assert.equal(isIcpBrasilSignature(manifest.signature), true);
  assert.equal(isItiValidationEligible(manifest.signature), true);
  assert.equal(manifest.signature.itiValidationEligible, true);
  assert.equal(composed.getTitle(), "relatorio");
  assert.equal(composed.getCreator(), "Maiocchi. Assinatura");
  assert.equal(composed.getProducer(), "Maiocchi. Assinatura");
  assert.match(composed.getSubject(), /ICP-Brasil/);
  assert.match(composed.catalog.get(PDFName.of("Lang")).toString(), /pt-BR/);
  assert.equal(sheet.getCreator(), "Maiocchi. Assinatura");
  assert.equal(sheet.getProducer(), "Maiocchi. Assinatura");
  assert.match(sheet.getTitle(), /Evidências da assinatura digital/);
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

test("usa marca PAdES e omite ITI nas modalidades simples e avançada sem infraestrutura reconhecida", async () => {
  for (const infrastructure of ["Assinatura eletrônica simples", "Assinatura eletrônica avançada"]) {
    const source = await sourceDocument(1);
    const manifest = manifestFor(source, 1, infrastructure);
    const attestation = {
      algorithm: "ML-DSA-65", keyId: "ml-dsa-65-test",
      code: "PQC-MLDSA65-1111-2222-3333-4444", manifestSha256: sha256(JSON.stringify(manifest)),
    };
    const result = await composePadesEvidence({ sourcePdf: source, manifest, attestation });
    const composed = await PDFDocument.load(result.presentation);
    const evidence = composed.getPage(1);
    const evidenceImages = evidence.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
    assert.equal(result.icpBrasilSealIncluded, false);
    assert.equal(result.visualSealMark, "PAdES");
    assert.equal(isIcpBrasilSignature(manifest.signature), false);
    assert.equal(isItiValidationEligible(manifest.signature), false);
    assert.equal(manifest.signature.itiValidationEligible, false);
    assert.equal(manifest.signature.policyOid, null);
    assert.equal(manifest.signature.optionalAttributes, null);
    assert.doesNotMatch(composed.getSubject(), /ICP-Brasil/);
    assert.equal(evidenceImages.keys().length, 3, "modalidade não ICP deve conter QR, Code128 e fundo de segurança");
    assert.equal(evidence.node.lookup(PDFName.of("Annots"), PDFArray).size(), 2);
    assert.equal(result.itiValidatorUrl, null);
    assert.equal(result.verificationUrl, "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-2222-3333-4444");
    assert.doesNotMatch(annotationUris(evidence).join(" "), /validar[.]iti[.]gov[.]br/);
  }
});

test("mantém marca PAdES e oferece VALIDAR ITI para assinatura avançada GOV.BR reconhecida", async () => {
  const source = await sourceDocument(1);
  const manifest = manifestFor(source, 1, "GOV.BR");
  const attestation = {
    algorithm: "ML-DSA-65", keyId: "ml-dsa-65-test",
    code: "PQC-MLDSA65-1111-2222-3333-4444", manifestSha256: sha256(JSON.stringify(manifest)),
  };
  const result = await composePadesEvidence({ sourcePdf: source, manifest, attestation });
  const composed = await PDFDocument.load(result.presentation);
  const evidence = composed.getPage(1);
  const evidenceImages = evidence.node.Resources().lookup(PDFName.of("XObject"), PDFDict);

  assert.equal(result.icpBrasilSealIncluded, false);
  assert.equal(result.visualSealMark, "PAdES");
  assert.equal(isIcpBrasilSignature(manifest.signature), false);
  assert.equal(isItiValidationEligible(manifest.signature), true);
  assert.equal(manifest.signature.itiValidationEligible, true);
  assert.equal(manifest.signature.policyOid, null);
  assert.equal(manifest.signature.optionalAttributes, null);
  assert.equal(evidenceImages.keys().length, 3);
  assert.equal(evidence.node.lookup(PDFName.of("Annots"), PDFArray).size(), 3);
  assert.equal(result.itiValidatorUrl, "https://validar.iti.gov.br/");
  assert.deepEqual(annotationUris(evidence).sort(), [
    "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-2222-3333-4444",
    "https://assinatura.maiocchi.adv.br/validar?codigo=MAI-2026-1111-2222-3333-4444",
    "https://validar.iti.gov.br/",
  ].sort());
});

test("recusa PDF que já contém ByteRange de assinatura", async () => {
  await assert.rejects(() => inspectUnsignedPdf(Buffer.from("%PDF-1.7\n/ByteRange [0 1 2 3]")), /already contains/);
});

test("classifica PDF malformado como entrada não processável", async () => {
  await assert.rejects(
    () => inspectUnsignedPdf(Buffer.from("%PDF-invalid")),
    (error) => error.status === 422 && error.message === "source PDF is malformed",
  );
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
