import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildEvidenceManifest, composePadesEvidence, inspectUnsignedPdf } from "../src/pades-evidence.mjs";
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

function manifestFor(source, pageCount = 2) {
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
      tokenType: "Certificado ICP-Brasil A3 / token criptografico",
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
  assert.deepEqual(result.signatureBox, { left: 72, bottom: 52, width: 451, height: 92 });
  assert.match(result.verificationUrl, /validar\/\?codigo=MAI-2026-1111-2222-3333-4444/);
  assert.equal(composed.getTitle(), "relatorio");
  assert.match(composed.getSubject(), /ICP-Brasil/);
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
