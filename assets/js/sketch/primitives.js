import { CONFIG, labelWidth } from './config.js';

/**
 * Pure path builders. Nothing here touches the DOM, so every function is
 * safe to call inside the plan phase and trivially testable in isolation.
 */

const n = (v) => Math.round(v * 100) / 100;

const SQ = Math.SQRT1_2;
const BISECTOR = {
  tl: [-SQ, -SQ],
  tr: [SQ, -SQ],
  br: [SQ, SQ],
  bl: [-SQ, SQ],
};

/** Filled triangle with its tip at (x,y), pointing along unit vector (ux,uy). */
export function arrowPath(x, y, ux, uy) {
  const bx = x - ux * CONFIG.arrowLen;
  const by = y - uy * CONFIG.arrowLen;
  const px = -uy * CONFIG.arrowHalfWidth;
  const py = ux * CONFIG.arrowHalfWidth;
  return `M${n(x)} ${n(y)}L${n(bx + px)} ${n(by + py)}L${n(bx - px)} ${n(by - py)}Z`;
}

const line = (x1, y1, x2, y2) => `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;

/**
 * A linear dimension between two coordinates along one axis. Covers both
 * extent dimensions (element width/height) and positional gaps (element to
 * wall, or element to element) — they differ only in where the extension
 * lines anchor.
 *
 * @param {object} o
 * @param {'x'|'y'} o.axis   direction being measured
 * @param {number}  o.a      start coordinate along the axis (document space)
 * @param {number}  o.b      end coordinate along the axis
 * @param {number}  o.cross  cross-axis coordinate of the dimension line
 * @param {number}  o.extA   cross-axis coordinate where extension line A anchors
 * @param {number}  o.extB   cross-axis coordinate where extension line B anchors
 * @param {-1|1}    o.out    direction from the geometry toward the dimension line
 * @param {string}  o.text   label text
 * @returns {object|null} a `linear` primitive, or null if too tight to draw
 */
export function planLinear({ axis, a, b, cross, extA, extB, out, text }) {
  const c = CONFIG;
  const span = Math.abs(b - a);
  if (span < c.minDimPx) return null;

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const horiz = axis === 'x';

  // Extension lines run along the cross axis, starting extGap off the
  // geometry and overshooting the dimension line by extOver.
  const extEnd = cross + out * c.extOver;
  const ext = [
    horiz
      ? line(a, extA + out * c.extGap, a, extEnd)
      : line(extA + out * c.extGap, a, extEnd, a),
    horiz
      ? line(b, extB + out * c.extGap, b, extEnd)
      : line(extB + out * c.extGap, b, extEnd, b),
  ];

  // When the span cannot fit two arrowheads plus the label, arrows flip to
  // sit outside the extension lines and point inward — standard CAD practice
  // for a tight dimension, and it reads as deliberate rather than broken.
  const needed = 2 * c.arrowLen + c.labelPad * 2 + labelWidth(text);
  const inside = span >= needed;

  const dimLine = inside
    ? (horiz ? line(lo, cross, hi, cross) : line(cross, lo, cross, hi))
    : (horiz
        ? line(lo - c.stubLen, cross, hi + c.stubLen, cross)
        : line(cross, lo - c.stubLen, cross, hi + c.stubLen));

  const dir = inside ? -1 : 1;
  const arrows = horiz
    ? [arrowPath(lo, cross, dir, 0), arrowPath(hi, cross, -dir, 0)]
    : [arrowPath(cross, lo, 0, dir), arrowPath(cross, hi, 0, -dir)];

  return {
    kind: 'linear',
    axis,
    span,
    inside,
    ext,
    line: dimLine,
    arrows,
    label: labelFor({ horiz, inside, lo, hi, cross, out, text }),
  };
}

function labelFor({ horiz, inside, lo, hi, cross, out, text }) {
  const c = CONFIG;
  // Glyphs sit on the far side of the dimension line from the geometry.
  // When out is +1 the baseline has to clear the line by roughly a cap height.
  const push = out < 0 ? -c.labelPad : c.labelPad + c.labelSize * 0.78;
  const mid = (lo + hi) / 2;

  if (!inside) {
    // Park the label past the end stub so it clears the flipped arrowheads.
    const off = c.stubLen + c.arrowLen + 4;
    return horiz
      ? { text, x: hi + off, y: cross + push, rot: 0, anchor: 'start', cx: hi + off, cy: cross + push }
      : { text, x: cross + push, y: hi + off, rot: -90, anchor: 'start', cx: cross + push, cy: hi + off };
  }

  return horiz
    ? { text, x: mid, y: cross + push, rot: 0, anchor: 'middle', cx: mid, cy: cross + push }
    : { text, x: cross + push, y: mid, rot: -90, anchor: 'middle', cx: cross + push, cy: mid };
}

/**
 * A leader: arrowhead at a referenced point, elbowed line out to a label.
 * Radius callouts and pattern-count callouts are both just this shape with
 * a different origin point and text, so they share one builder.
 */
function buildLeader(originX, originY, ux, uy, text) {
  const c = CONFIG;
  const kneeX = originX + ux * c.leaderLen;
  const kneeY = originY + uy * c.leaderLen;
  const sign = ux < 0 ? -1 : 1;
  const landX = kneeX + sign * c.landingLen;

  return {
    kind: 'leader',
    leader: `M${n(originX)} ${n(originY)}L${n(kneeX)} ${n(kneeY)}L${n(landX)} ${n(kneeY)}`,
    arrow: arrowPath(originX, originY, ux, uy),
    label: {
      text,
      x: landX + sign * 4,
      y: kneeY + c.labelSize * 0.34,
      rot: 0,
      anchor: sign < 0 ? 'end' : 'start',
      cx: landX + sign * 4,
      cy: kneeY,
    },
  };
}

/**
 * Radius callout: a single arrowhead ON the arc with the label at the tail,
 * angled along the corner bisector — the convention the logo uses.
 */
export function planRadius(box, corner, radii) {
  const r = radii[corner].x;
  if (r < CONFIG.minRadiusPx) return null;

  const cx = corner[1] === 'l' ? box.x + r : box.x + box.w - r;
  const cy = corner[0] === 't' ? box.y + r : box.y + box.h - r;
  const [ux, uy] = BISECTOR[corner];

  return buildLeader(cx + ux * r, cy + uy * r, ux, uy, `R${Math.round(r)}`);
}

/**
 * Pattern-count callout: "Nx" on a leader out of the element's corner,
 * marking a uniform repeat run — the CAD convention for a linear/grid
 * pattern of identical features, as opposed to dimensioning every instance.
 */
export function planCount(box, corner, count) {
  const originX = corner[1] === 'l' ? box.x : box.x + box.w;
  const originY = corner[0] === 't' ? box.y : box.y + box.h;
  const [ux, uy] = BISECTOR[corner];
  return buildLeader(originX, originY, ux, uy, `${count}x`);
}

/**
 * Control points. Every corner emits a dot at the mathematical box corner;
 * a filleted corner additionally emits its two arc tangent points.
 *
 * @param {'all'|'corners'|'tangents'} mode
 */
export function planDots(box, radii, border, mode = 'all') {
  const pts = [];
  // CSS borders draw inside the border box while SVG strokes straddle their
  // path, so dots must be inset by half the border to land on its centreline.
  const i = (border?.top ?? 0) / 2;
  const L = box.x + i;
  const R = box.x + box.w - i;
  const T = box.y + i;
  const B = box.y + box.h - i;

  const corners = [
    ['tl', L, T, +1, +1],
    ['tr', R, T, -1, +1],
    ['br', R, B, -1, -1],
    ['bl', L, B, +1, -1],
  ];

  for (const [key, x, y, sx, sy] of corners) {
    const r = Math.max(0, radii[key].x - i);
    if (mode !== 'tangents') pts.push([x, y]);
    if (mode !== 'corners' && r >= 1) {
      pts.push([x + sx * r, y], [x, y + sy * r]);
    }
  }

  // On a full circle every quadrant point is the tangent of two adjacent
  // corners, so it would otherwise be drawn twice.
  const seen = new Set();
  const points = [];
  for (const [x, y] of pts) {
    const key = `${n(x)},${n(y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([n(x), n(y)]);
  }
  return { kind: 'dots', points };
}

/** Outline drawn by the overlay for elements that have no CSS border of their own. */
export function planOutline(box, radii, border) {
  const i = (border?.top ?? 0) / 2;
  return {
    kind: 'outline',
    x: n(box.x + i),
    y: n(box.y + i),
    w: n(Math.max(0, box.w - i * 2)),
    h: n(Math.max(0, box.h - i * 2)),
    r: n(Math.max(0, radii.tl.x - i)),
  };
}
