import { CONFIG } from './config.js';

/** Parses the data-dim-* authoring API into an immutable-ish spec object. */

export const DIM_ATTRS = [
  'data-dim', 'data-dim-id', 'data-dim-mode', 'data-dim-size', 'data-dim-side',
  'data-dim-radius', 'data-dim-from', 'data-dim-dots', 'data-dim-space',
  'data-dim-outline', 'data-dim-priority', 'data-dim-min', 'data-dim-vw',
  'data-dim-repeat', 'data-dim-time-axis', 'data-dim-unit', 'data-dim-scale',
  'data-dim-anchor', 'data-dim-datum',
];

const SIDES = new Set(['left', 'right', 'top', 'bottom']);
const CORNERS = new Set(['tl', 'tr', 'br', 'bl']);

let counter = 0;

function parseSize(raw, shorthand) {
  const src = raw ?? shorthand;
  if (src === 'none') return [];
  if (!src) return ['w', 'h'];
  const t = src.split(/[\s,]+/).filter(Boolean);
  const out = [];
  if (t.includes('w')) out.push('w');
  if (t.includes('h')) out.push('h');
  return out.length ? out : ['w', 'h'];
}

function parseSides(raw) {
  const out = { w: 'top', h: 'left' };
  if (!raw) return out;
  for (const part of raw.split(/[\s;]+/).filter(Boolean)) {
    const [key, value] = part.split(':');
    if (key === 'w' && (value === 'top' || value === 'bottom')) out.w = value;
    if (key === 'h' && (value === 'left' || value === 'right')) out.h = value;
  }
  return out;
}

function parseRadius(raw, shorthand) {
  if (raw === 'none') return 'none';
  if (!raw) return shorthand?.includes('r') || shorthand === undefined ? 'auto' : 'none';
  if (raw === 'auto' || raw === 'all') return raw === 'all' ? ['tl', 'tr', 'br', 'bl'] : 'auto';
  const list = raw.split(/[\s,]+/).filter((c) => CORNERS.has(c));
  return list.length ? list : 'auto';
}

/**
 * `data-dim-from="left:page; top:#hero-title"`
 *
 * An optional third part names which edge of the target to measure from:
 * `left:#plate:left`. Without it the target's *facing* edge is used, which is
 * right for neighbours but wrong for a feature inside a part — a hole is
 * located from the plate's near edge, not its far one.
 */
function parseFrom(raw) {
  if (!raw) return [];
  const out = [];
  for (const entry of raw.split(';')) {
    const [side, target, edge] = entry.split(':').map((s) => s?.trim());
    if (!SIDES.has(side) || !target) continue;
    const el = target.startsWith('#') ? document.getElementById(target.slice(1)) : null;
    out.push({
      side,
      target: target.replace(/^#/, ''),
      el,
      edge: SIDES.has(edge) || edge === 'center' ? edge : null,
    });
  }
  return out;
}

/** `"768+"`, `"-640"`, `"640-1200"` */
function parseVw(raw) {
  if (!raw) return null;
  let m = /^(\d+)\+$/.exec(raw);
  if (m) return { min: +m[1], max: Infinity };
  m = /^-(\d+)$/.exec(raw);
  if (m) return { min: 0, max: +m[1] };
  m = /^(\d+)-(\d+)$/.exec(raw);
  if (m) return { min: +m[1], max: +m[2] };
  return null;
}

/**
 * Sticky elements are doc-space when unstuck and viewport-space when stuck.
 * getBoundingClientRect always reports current visual position, so routing
 * them to the fixed layer is correct in both states.
 */
function resolveSpace(el, declared) {
  if (declared === 'doc' || declared === 'fixed') return declared;
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const pos = getComputedStyle(node).position;
    if (pos === 'fixed' || pos === 'sticky') return 'fixed';
  }
  return 'doc';
}

export function parseSpec(el) {
  const d = el.dataset;
  const shorthand = d.dim || undefined;
  const space = resolveSpace(el, d.dimSpace);
  // measure.js reads this back to decide whether to add scroll offset.
  d.dimSpace = space;

  return {
    el,
    id: d.dimId || el.id || `sk-${++counter}`,
    mode: d.dimMode === 'fluid' ? 'fluid' : 'fixed',
    size: parseSize(d.dimSize, shorthand),
    sides: parseSides(d.dimSide),
    radius: parseRadius(d.dimRadius, shorthand),
    from: parseFrom(d.dimFrom),
    dots: d.dimDots || 'all',
    outline: d.dimOutline || 'css',
    space,
    priority: Number(d.dimPriority ?? 3),
    minSize: Number(d.dimMin ?? CONFIG.minSizePx),
    vw: parseVw(d.dimVw),
    repeat: d.dimRepeat || null,
    // A pixel span isn't always the meaningful quantity — a Gantt block's
    // height is really a duration. When set, this axis's label shows the
    // measured px scaled and unit-suffixed instead of a raw pixel count.
    timeAxis: d.dimTimeAxis === 'w' || d.dimTimeAxis === 'h' ? d.dimTimeAxis : null,
    unit: d.dimUnit || '',
    scale: Number(d.dimScale ?? 1),
    // Holes and other internal features are located to their centre line, not
    // to an edge — that's what a location dimension means on a drawing.
    anchor: d.dimAnchor === 'center' ? 'center' : 'edge',
    // Draw this element's dimensions off another element's edges. A feature
    // inside a part must have its dimension lines outside the part, otherwise
    // they're drawn on top of the material they're measuring into.
    datum: d.dimDatum ? document.getElementById(d.dimDatum.replace(/^#/, '')) : null,
  };
}
