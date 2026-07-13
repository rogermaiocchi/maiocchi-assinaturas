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
  const [editor, renderer, fingerprintIcon, javaProvider] = await Promise.all([
    readFile(new URL("tools/pades-visual-editor/main.tsx", repositoryRoot), "utf8"),
    readFile(new URL("services/pki-bridge/src/pades-evidence.mjs", repositoryRoot), "utf8"),
    import(new URL("services/pki-bridge/src/fingerprint-pattern-icon.mjs", repositoryRoot)),
    readFile(new URL("services/pades-provider/src/main/java/br/adv/maiocchi/pades/PadesEngine.java", repositoryRoot), "utf8"),
  ]);

  assert.deepEqual(A4, { width: 595.28, height: 841.89 });
  assert.deepEqual(PAGE_MARGINS, { top: 85.04, right: 56.69, bottom: 56.69, left: 85.04 });
  assert.deepEqual(SIGNATURE_FRAME, { left: 85.04, bottom: 67.89, width: 453.55, height: 92 });
  assert.deepEqual(editorBox(EVIDENCE_BLOCKS.seal), { x: 113, y: 909, w: 605, h: 123 });
  assert.equal(Math.round(A4.width * EDITOR_SCALE), 794);
  assert.equal(Math.round(A4.height * EDITOR_SCALE), 1123);

  assert.match(editor, /pades-evidence-layout\.mjs/);
  assert.match(editor, /maiocchi-pades-layout-v4/);
  assert.match(editor, /icpBrasilCredentialIncluded: icpBrasil/);
  assert.match(editor, /Fingerprint as FingerprintPattern/);
  assert.match(editor, /<FingerprintPattern aria-hidden="true"/);
  assert.doesNotMatch(editor, /Resumo visual da assinatura/);
  assert.match(renderer, /drawFingerprintPattern/);
  assert.doesNotMatch(renderer, /RESUMO VISUAL DA ASSINATURA/);
  assert.equal(fingerprintIcon.FINGERPRINT_PATTERN_SOURCE, "https://lucide.dev/icons/fingerprint-pattern");
  assert.equal(fingerprintIcon.FINGERPRINT_PATTERN_VIEWBOX, 24);
  assert.equal(fingerprintIcon.FINGERPRINT_PATTERN_PATHS.length, 9);

  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_X"), SIGNATURE_BOX.left);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_BOTTOM"), SIGNATURE_BOX.bottom);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_WIDTH"), SIGNATURE_BOX.width);
  assert.equal(javaNumber(javaProvider, "VISIBLE_SIGNATURE_HEIGHT"), SIGNATURE_BOX.height);
});
