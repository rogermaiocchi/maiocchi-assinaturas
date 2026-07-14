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
  header: Object.freeze({ left: BODY.left, top: PAGE_MARGINS.top, width: BODY.width, height: 22 }),
  title: Object.freeze({ left: BODY.left, top: 114, width: BODY.width, height: 50 }),
  document: Object.freeze({ left: BODY.left, top: 174, width: BODY.width, height: 60 }),
  hash: Object.freeze({ left: BODY.left, top: 247, width: 357.55, height: 64 }),
  qr: Object.freeze({ left: BODY.right - 80, top: 238, width: 80, height: 80 }),
  context: Object.freeze({ left: BODY.left, top: 323, width: BODY.width, height: 151 }),
  attributes: Object.freeze({ left: BODY.left, top: 482, width: BODY.width, height: 68 }),
  pqc: Object.freeze({ left: BODY.left, top: 558, width: 286, height: 52 }),
  validation: Object.freeze({ left: 385, top: 558, width: BODY.right - 385, height: 52 }),
  barcode: Object.freeze({ left: BODY.left, top: 618, width: BODY.width, height: 32 }),
  seal: Object.freeze({ left: BODY.left, top: 658, width: BODY.width, height: 92 }),
  legal: Object.freeze({ left: BODY.left, top: 758, width: BODY.width, height: 27 }),
});

export const PAGE_CHROME = Object.freeze({
  topRuleHeight: 2,
  sideRailWidth: 31,
  sideMarkSize: 16,
  sideMarkTop: 8,
  sideRegistryGap: 8,
  sideRegistryFontSize: 5.2,
  sideRegistryMinimumFontSize: 4.2,
  sideLineOneRight: 8,
  sideLineTwoRight: 17,
});

export const SIGNATURE_FRAME = Object.freeze({
  left: EVIDENCE_BLOCKS.seal.left,
  bottom: Number((A4.height - EVIDENCE_BLOCKS.seal.top - EVIDENCE_BLOCKS.seal.height).toFixed(2)),
  width: EVIDENCE_BLOCKS.seal.width,
  height: EVIDENCE_BLOCKS.seal.height,
});

export const SIGNATURE_BOX = Object.freeze({
  left: 105.04,
  bottom: Number((SIGNATURE_FRAME.bottom + 15).toFixed(2)),
  width: 320,
  height: 66,
});

export const TYPOGRAPHY = Object.freeze({
  title: 18,
  subtitle: 8.2,
  label: 7.2,
  value: 8.2,
  technical: 7.2,
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
