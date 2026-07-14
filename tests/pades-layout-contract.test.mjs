import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  A4,
  EDITOR_SCALE,
  EVIDENCE_BLOCKS,
  PAGE_CHROME,
  PAGE_MARGINS,
  SIGNATURE_BOX,
  SIGNATURE_FRAME,
  editorBox,
} from "../services/pki-bridge/src/pades-evidence-layout.mjs";

const repositoryRoot = new URL("../", import.meta.url);

function javaNumber(source, name) {
  const match = source.match(new RegExp(`private static final float ${name} = ([0-9.]+)f;`));
  assert.ok(match, `constante Java ausente: ${name}`);
  return Number(match[1]);
}

test("mantém uma única geometria entre renderer, editor e provider PAdES", async () => {
  const [editor, editorStyles, renderer, javaProvider, securityBackground, rendererBackground, editorBackground] = await Promise.all([
    readFile(new URL("tools/pades-visual-editor/main.tsx", repositoryRoot), "utf8"),
    readFile(new URL("tools/pades-visual-editor/style.css", repositoryRoot), "utf8"),
    readFile(new URL("services/pki-bridge/src/pades-evidence.mjs", repositoryRoot), "utf8"),
    readFile(new URL("services/pades-provider/src/main/java/br/adv/maiocchi/pades/PadesEngine.java", repositoryRoot), "utf8"),
    readFile(new URL("tools/pades-visual-editor/assets/pades-evidence-page-background.svg", repositoryRoot), "utf8"),
    readFile(new URL("services/pki-bridge/assets/pades-evidence-page.png", repositoryRoot)),
    readFile(new URL("tools/pades-visual-editor/public/assets/pades-evidence-page-300dpi.png", repositoryRoot)),
  ]);

  assert.deepEqual(A4, { width: 595.28, height: 841.89 });
  assert.deepEqual(PAGE_MARGINS, { top: 85.04, right: 56.69, bottom: 56.69, left: 85.04 });
  assert.deepEqual(SIGNATURE_FRAME, { left: 85.04, bottom: 91.89, width: 453.55, height: 100 });
  assert.deepEqual(editorBox(EVIDENCE_BLOCKS.seal), { x: 113, y: 867, w: 605, h: 133 });
  assert.equal(Math.round(A4.width * EDITOR_SCALE), 794);
  assert.equal(Math.round(A4.height * EDITOR_SCALE), 1123);
  assert.equal(PAGE_CHROME.topRuleHeight, 3, "o filete dourado superior mantém a espessura canônica");
  assert.ok(PAGE_CHROME.sideRailWidth < PAGE_MARGINS.right, "a faixa lateral cabe na margem direita");
  assert.equal(PAGE_CHROME.sideRegistryRight, PAGE_CHROME.sideRailWidth / 2, "a inscrição lateral fica centralizada");
  const usableBottom = A4.height - PAGE_MARGINS.bottom;
  for (const [name, block] of Object.entries(EVIDENCE_BLOCKS)) {
    assert.ok(block.left >= PAGE_MARGINS.left, `${name} respeita a margem esquerda`);
    assert.ok(block.left + block.width <= A4.width - PAGE_MARGINS.right + 1e-9, `${name} respeita a margem direita`);
    assert.ok(block.top >= PAGE_MARGINS.top, `${name} respeita a margem superior`);
    assert.ok(block.top + block.height <= usableBottom + 1e-9, `${name} respeita a margem inferior`);
  }

  assert.match(editor, /pades-evidence-layout\.mjs/);
  assert.match(editor, /maiocchi-pades-layout-v9/);
  assert.match(editor, /version: 9/);
  assert.match(editor, /type SignatureMode = "icp-brasil" \| "gov-br" \| "simples"/);
  assert.match(editor, /icpBrasilCredentialIncluded: modeConfig[.]icpBrasil/);
  assert.match(editor, /itiValidationEligible: modeConfig[.]itiValidationEligible/);
  assert.match(editor, /assinatura[.]maiocchi[.]adv[.]br\/validar/);
  assert.doesNotMatch(editor, /FingerprintPattern/);
  assert.doesNotMatch(editor, /margin-verification/);
  assert.match(editor, /credential-mark/);
  assert.match(editor, /seal-pades-mark/);
  assert.match(editor, /pades-evidence-page-300dpi[.]png/);
  assert.match(editor, /https:\/\/validar[.]iti[.]gov[.]br\//);
  assert.doesNotMatch(editor, /Resumo visual da assinatura/);
  assert.doesNotMatch(renderer, /drawFingerprintPattern/);
  assert.match(renderer, /drawContentRail\(originalPage, index \+ 1\)/);
  assert.doesNotMatch(renderer, /drawContentRail\(page\)/);
  assert.doesNotMatch(renderer, /drawContentHeader/);
  assert.match(renderer, /drawTopRule\(originalPage\)/);
  assert.match(renderer, /drawTopRule\(page\)/);
  assert.match(renderer, /page[.]drawImage\(evidenceBackground, \{ x: 0, y: 0, width: A4[.]width, height: A4[.]height \}\)/);
  assert.doesNotMatch(renderer, /Validação externa:/);
  assert.doesNotMatch(renderer, /Assinatura eletrônica qualificada/);
  assert.doesNotMatch(renderer, /page[.]drawText\(barcodeValue/);
  assert.doesNotMatch(renderer, /drawPageFooter|Página \$\{index \+ 1\} de \$\{totalPages\}/);
  assert.match(renderer, /degrees\(-90\)/);
  const railRenderer = renderer.slice(renderer.indexOf("const drawContentRail"), renderer.indexOf("originalPages.forEach"));
  assert.match(railRenderer, /ASSINATURA[.]MAIOCCHI[.]ADV[.]BR - DOCUMENTO \$\{manifest[.]documentNumber\} - HASH \$\{manifest[.]source[.]sha256\} - CÓDIGO \$\{attestation[.]code\} - VERIFICAÇÃO \$\{manifest[.]publicId\} - PÁG \$\{pageNumber\} DE \$\{totalPages\}/);
  assert.match(railRenderer, /fitUnbrokenValue/);
  assert.match(railRenderer, /railLeft \+ \(PAGE_CHROME[.]sideRailWidth - PAGE_CHROME[.]sideMarkSize\) \/ 2/);
  assert.doesNotMatch(railRenderer, /drawLine|fitValue\(|registryLines|ATESTADO PÓS-QUÂNTICO/);
  assert.match(renderer, /originalPages[.]forEach\(\(originalPage, index\) => \{/);
  assert.doesNotMatch(editor, /Página 13 de 13/);
  assert.doesNotMatch(editor, /MAI\|MAI-/);
  assert.doesNotMatch(editor, />VALIDAR<\/span>/);
  assert.match(renderer, /portalVerificationUrl\(manifest[.]publicId, baseUrl\)/);
  assert.match(renderer, /isItiValidationEligible\(manifest[.]signature\)/);
  assert.match(renderer, /function drawPadesMark/);
  assert.match(renderer, /visualSealMark: icpBrasil \? "ICP-Brasil" : "PAdES"/);
  assert.doesNotMatch(renderer, /FUNDAMENTO JURÍDICO/);
  assert.doesNotMatch(editor, /Fundamento jurídico/);
  assert.doesNotMatch(renderer, /RESUMO VISUAL DA ASSINATURA/);
  assert.match(securityBackground, /Guilloché em linguagem de passaporte/);
  assert.match(securityBackground, />m<\/text>/);
  assert.match(securityBackground, />MAIOCCHI<\/text>/);
  assert.match(securityBackground, /MAIOCCHI • M[.] • PADES • AUTENTICIDADE/);
  assert.doesNotMatch(securityBackground, /<rect x="(?:54|69|82|99|124|140)"/);
  assert.doesNotMatch(renderer, /pades-security-seal[.]png/);
  assert.doesNotMatch(editor, /pades-security-seal-4k[.]png/);
  const panelRenderer = renderer.slice(renderer.indexOf("function drawPanel"), renderer.indexOf("function drawSectionHeading"));
  assert.doesNotMatch(panelRenderer, /borderColor|borderOpacity|borderWidth/);
  const credentialRenderer = renderer.slice(renderer.indexOf("const signatureFrameRect"), renderer.indexOf("const legalText"));
  assert.doesNotMatch(credentialRenderer, /borderColor|borderOpacity|borderWidth|drawLine/);
  assert.match(editorStyles, /[.]panel \{ border: 0; background: rgba\(252,254,252,[.]72\); \}/);
  assert.match(editorStyles, /[.]qr-block \{[^}]*border: 0;[^}]*background: rgba\(255,255,255,[.]84\);/);
  assert.match(editorStyles, /[.]security-credential \{[^}]*border: 0;[^}]*background: rgba\(252,254,252,[.]72\);/);
  assert.doesNotMatch(editorStyles, /[.]security-credential::after/);
  assert.match(editorStyles, /[.]credential-mark \{[^}]*border-left: 0;/);
  assert.equal(rendererBackground[25], 2, "o fundo A4 deve ser RGB sem canal alfa");
  assert.deepEqual(rendererBackground, editorBackground, "renderer e laboratório devem usar o mesmo bitmap A4");

  assert.match(javaProvider, /renderVisibleSignature/);
  assert.match(javaProvider, /assinatura-visual-icp-brasil[.]png/);
  assert.match(javaProvider, /VISIBLE_SIGNATURE_IMAGE_WIDTH/);
  assert.doesNotMatch(javaProvider, /setBackgroundColor\(Color[.]WHITE\)/);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_X"), SIGNATURE_BOX.left);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_BOTTOM"), SIGNATURE_BOX.bottom);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_WIDTH"), SIGNATURE_BOX.width);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_HEIGHT"), SIGNATURE_BOX.height);
});
