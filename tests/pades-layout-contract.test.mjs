import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  A4,
  EDITOR_SCALE,
  EVIDENCE_BLOCKS,
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
  const [editor, renderer, javaProvider, securityBackground] = await Promise.all([
    readFile(new URL("tools/pades-visual-editor/main.tsx", repositoryRoot), "utf8"),
    readFile(new URL("services/pki-bridge/src/pades-evidence.mjs", repositoryRoot), "utf8"),
    readFile(new URL("services/pades-provider/src/main/java/br/adv/maiocchi/pades/PadesEngine.java", repositoryRoot), "utf8"),
    readFile(new URL("tools/pades-visual-editor/assets/pades-security-seal-background.svg", repositoryRoot), "utf8"),
  ]);

  assert.deepEqual(A4, { width: 595.28, height: 841.89 });
  assert.deepEqual(PAGE_MARGINS, { top: 85.04, right: 56.69, bottom: 56.69, left: 85.04 });
  assert.deepEqual(SIGNATURE_FRAME, { left: 85.04, bottom: 67.89, width: 453.55, height: 92 });
  assert.deepEqual(editorBox(EVIDENCE_BLOCKS.seal), { x: 113, y: 909, w: 605, h: 123 });
  assert.equal(Math.round(A4.width * EDITOR_SCALE), 794);
  assert.equal(Math.round(A4.height * EDITOR_SCALE), 1123);

  assert.match(editor, /pades-evidence-layout\.mjs/);
  assert.match(editor, /maiocchi-pades-layout-v5/);
  assert.match(editor, /icpBrasilCredentialIncluded: icpBrasil/);
  assert.doesNotMatch(editor, /FingerprintPattern/);
  assert.doesNotMatch(editor, /margin-verification/);
  assert.match(editor, /seal-icp-mark/);
  assert.match(editor, /https:\/\/validar[.]iti[.]gov[.]br\//);
  assert.doesNotMatch(editor, /Resumo visual da assinatura/);
  assert.doesNotMatch(renderer, /drawFingerprintPattern/);
  assert.match(renderer, /drawContentRegistry\(originalPage\)/);
  assert.doesNotMatch(renderer, /drawContentRegistry\(page\)/);
  assert.match(renderer, /drawTopRule\(originalPage\)/);
  assert.match(renderer, /drawTopRule\(page\)/);
  assert.match(renderer, /Validação externa: validar[.]iti[.]gov[.]br/);
  assert.doesNotMatch(renderer, /FUNDAMENTO JURÍDICO/);
  assert.doesNotMatch(editor, />Fundamento jurídico</);
  assert.doesNotMatch(renderer, /RESUMO VISUAL DA ASSINATURA/);
  assert.doesNotMatch(securityBackground, /PERFIL TÉCNICO/);
  assert.doesNotMatch(securityBackground, /font-size="116"[^>]*>PAdES</);

  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_X"), SIGNATURE_BOX.left);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_BOTTOM"), SIGNATURE_BOX.bottom);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_WIDTH"), SIGNATURE_BOX.width);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_HEIGHT"), SIGNATURE_BOX.height);
});
