import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEvidenceManifest,
  composePadesEvidence,
  inspectUnsignedPdf,
} from "../../../services/pki-bridge/src/pades-evidence.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new TypeError("uso: node render-evidence-preview.mjs <entrada.pdf> [saida.pdf] [icp-brasil|gov-br|simples]");

const signatureModes = Object.freeze({
  "icp-brasil": Object.freeze({
    tokenType: "Certificado ICP-Brasil A3 · token criptográfico",
    format: "PAdES",
    profile: "AD-RB",
    infrastructure: "ICP-Brasil",
  }),
  "gov-br": Object.freeze({
    tokenType: "Conta GOV.BR · infraestrutura reconhecida",
    format: "PAdES",
    profile: "Assinatura eletrônica avançada",
    infrastructure: "GOV.BR",
  }),
  simples: Object.freeze({
    tokenType: "Modalidade simples registrada pelo fluxo",
    format: "PAdES",
    profile: "Assinatura eletrônica simples",
    infrastructure: "Assinatura eletrônica simples",
  }),
});
const signatureMode = process.argv[4] || "icp-brasil";
if (!(signatureMode in signatureModes)) throw new TypeError(`modalidade inválida: ${signatureMode}`);
const signatureMetadata = signatureModes[signatureMode];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = process.argv[3]
  || path.resolve(scriptDirectory, "../output/pades-evidence-preview.pdf");
const sourcePdf = await readFile(path.resolve(inputPath));
const { pageCount } = await inspectUnsignedPdf(sourcePdf);
const sourceSha256 = createHash("sha256").update(sourcePdf).digest("hex");
const createdAt = "2026-07-13T18:52:50.000Z";
const manifest = buildEvidenceManifest({
  publicId: "MAI-2026-ESY0-6MPD-QQBP-RMG4",
  documentNumber: "20260713155250664425469195217",
  documentName: path.basename(inputPath),
  sourceSha256,
  sourceSize: sourcePdf.length,
  sourcePageCount: pageCount,
  createdAt,
  documentContext: {
    intendedFor: "Destinatário informado no documento",
    purpose: "Conferência e preservação do documento eletrônico",
  },
  signingMetadata: {
    observedIp: "189.6.10.176",
    platform: "MacBook Pro · macOS · MaiocchiPadesTokenAgent",
    userAgent: "MaiocchiPadesTokenAgent/1.2.0",
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
    capturedAt: createdAt,
    ...signatureMetadata,
  },
});
const attestation = {
  algorithm: "ML-DSA-65",
  keyId: "maiocchi-pqc-2026-01",
  code: "PQC-MLDSA65-465P-VSS7-TP75-ZZC4",
  manifestSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
};
const result = await composePadesEvidence({ sourcePdf, manifest, attestation });

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, result.presentation);
console.log(JSON.stringify({
  outputPath,
  pageCount: result.totalPages,
  publicId: manifest.publicId,
  signatureMode,
  sourceSha256,
  itiValidatorUrl: result.itiValidatorUrl,
  visualSealMark: result.visualSealMark,
}, null, 2));
