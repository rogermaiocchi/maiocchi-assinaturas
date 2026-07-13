const POINTS_PER_CM = 72 / 2.54;

export const A4 = Object.freeze({ width: 595.28, height: 841.89 });
export const EDITOR_SCALE = 4 / 3;

export const PAGE_MARGINS = Object.freeze({
  top: Number((3 * POINTS_PER_CM).toFixed(2)),
  right: Number((2 * POINTS_PER_CM).toFixed(2)),
  bottom: Number((2 * POINTS_PER_CM).toFixed(2)),
  left: Number((3 * POINTS_PER_CM).toFixed(2)),
});

const bodyWidth = Number((A4.width - PAGE_MARGINS.left - PAGE_MARGINS.right).toFixed(2));
const bodyRight = Number((A4.width - PAGE_MARGINS.right).toFixed(2));

export const BODY = Object.freeze({
  left: PAGE_MARGINS.left,
  right: bodyRight,
  width: bodyWidth,
});

export const EVIDENCE_BLOCKS = Object.freeze({
  header: Object.freeze({ left: BODY.left, top: 28, width: BODY.width, height: 38 }),
  title: Object.freeze({ left: BODY.left, top: 85, width: BODY.width, height: 56 }),
  document: Object.freeze({ left: BODY.left, top: 158, width: BODY.width, height: 62 }),
  hash: Object.freeze({ left: BODY.left, top: 234, width: 357.55, height: 68 }),
  qr: Object.freeze({ left: BODY.right - 80, top: 228, width: 80, height: 80 }),
  context: Object.freeze({ left: BODY.left, top: 315, width: BODY.width, height: 169 }),
  attributes: Object.freeze({ left: BODY.left, top: 497, width: BODY.width, height: 68 }),
  pqc: Object.freeze({ left: BODY.left, top: 578, width: 286, height: 52 }),
  validation: Object.freeze({ left: 385, top: 578, width: BODY.right - 385, height: 52 }),
  barcode: Object.freeze({ left: BODY.left, top: 639, width: BODY.width, height: 34 }),
  seal: Object.freeze({ left: BODY.left, top: 682, width: BODY.width, height: 92 }),
  legal: Object.freeze({ left: BODY.left, top: 784, width: BODY.width, height: 25 }),
  footer: Object.freeze({ left: BODY.left, top: 811, width: BODY.width, height: 15 }),
});

export const SIGNATURE_FRAME = Object.freeze({
  left: EVIDENCE_BLOCKS.seal.left,
  bottom: Number((A4.height - EVIDENCE_BLOCKS.seal.top - EVIDENCE_BLOCKS.seal.height).toFixed(2)),
  width: EVIDENCE_BLOCKS.seal.width,
  height: EVIDENCE_BLOCKS.seal.height,
});

export const SIGNATURE_BOX = Object.freeze({
  left: 105.04,
  bottom: 82.89,
  width: 320,
  height: 66,
});

export const TYPOGRAPHY = Object.freeze({
  title: 20,
  subtitle: 9,
  label: 8,
  value: 9,
  technical: 8,
  footer: 8,
});

export function pdfY(top, height = 0) {
  return A4.height - top - height;
}

export function editorBox(block) {
  return {
    x: Math.round(block.left * EDITOR_SCALE),
    y: Math.round(block.top * EDITOR_SCALE),
    w: Math.round(block.width * EDITOR_SCALE),
    h: Math.round(block.height * EDITOR_SCALE),
  };
}
