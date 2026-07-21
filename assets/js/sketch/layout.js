import { CONFIG, labelWidth } from './config.js';
import { planLinear, planRadius, planCount, planDots, planOutline } from './primitives.js';

/**
 * Turns specs + measurements into a flat DrawPlan. Pure: no DOM access, so
 * this whole module is safe to run in the plan phase and easy to test.
 */

/** Last displayed integer per dimension, for sub-pixel hysteresis. */
const shown = new Map();

/**
 * Rects come back as 159.99999999999997. Rounding naively makes labels
 * flicker between 159 and 160 while dragging a resize, so only move the
 * displayed integer once the true value has drifted past half a pixel.
 */
function displayValue(key, raw) {
  const prev = shown.get(key);
  if (prev !== undefined && Math.abs(raw - prev) <= 0.5) return prev;
  const v = Math.round(raw);
  shown.set(key, v);
  return v;
}

const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

export function buildPlan(entries, measurements, vp, tier) {
  const requests = [];
  const extras = [];

  for (const { spec, m } of entries) {
    if (!m?.ok) continue;
    if (spec.priority < tier.minPriority) continue;
    const fluid = spec.mode === 'fluid';
    const ctx = { spec, m, fluid };

    collectExtents(ctx, requests, tier, measurements);
    if (tier.positional) {
      collectGaps(ctx, measurements, vp, requests);
      // The count callout rides with the pitch dimensions it explains —
      // both come from the same pattern classification, so they appear
      // and disappear together as the viewport shrinks.
      if (spec.pattern) {
        extras.push({
          key: `${spec.id}:count`,
          specId: spec.id,
          space: spec.space,
          fluid,
          prim: planCount(m.box, 'br', spec.pattern.count),
        });
      }
    }
    if (tier.radius && !spec.suppressRadius) collectRadii(ctx, extras);
    if (tier.dots && spec.dots !== 'none') {
      extras.push({
        key: `${spec.id}:dots`,
        specId: spec.id,
        space: spec.space,
        fluid,
        prim: planDots(m.box, m.radii, m.border, spec.dots),
      });
    }
    if (spec.outline === 'svg') {
      extras.push({
        key: `${spec.id}:outline`,
        specId: spec.id,
        space: spec.space,
        fluid,
        prim: planOutline(m.box, m.radii, m.border),
      });
    }
  }

  allocateLanes(requests);

  const prims = [];
  for (const req of requests) {
    const prim = buildLinear(req);
    if (prim) prims.push({ key: req.key, specId: req.specId, space: req.space, fluid: req.fluid, prim });
  }
  for (const e of extras) {
    if (e.prim) prims.push(e);
  }

  deoverlapLabels(prims);
  return { prims: prims.slice(0, CONFIG.maxLabels * 2) };
}

/* ------------------------------------------------------------------ */
/* Request collection                                                  */
/* ------------------------------------------------------------------ */

function collectExtents({ spec, m, fluid }, out, tier, measurements) {
  const { box } = m;
  const datumBox = datumBoxFor(spec, m, measurements);
  // A non-representative instance in a mixed-uniformity repeat group (one
  // axis shared, one axis not) is restricted to only the axis that actually
  // varies — the shared axis is already stated once, on the representative
  // instance, so redrawing it on every sibling would just repeat a number
  // that never changes.
  const axes = spec.sizeOverride ? [spec.sizeOverride] : spec.size;

  if (axes.includes('w') && box.w >= spec.minSize) {
    const side = spec.sides.w;
    out.push(makeRequest({
      key: `${spec.id}:w`, spec, fluid, side,
      axis: 'x', a: box.x, b: box.x + box.w,
      edge: side === 'top' ? datumBox.y : datumBox.y + datumBox.h,
      out: side === 'top' ? -1 : 1,
      raw: box.w, timed: spec.timeAxis === 'w',
    }));
  }

  if (axes.includes('h') && box.h >= spec.minSize) {
    const side = spec.sides.h;
    out.push(makeRequest({
      key: `${spec.id}:h`, spec, fluid, side,
      axis: 'y', a: box.y, b: box.y + box.h,
      edge: side === 'left' ? datumBox.x : datumBox.x + datumBox.w,
      out: side === 'left' ? -1 : 1,
      raw: box.h, timed: spec.timeAxis === 'h',
    }));
  }
}

function collectGaps({ spec, m, fluid }, measurements, vp, out) {
  const { box } = m;
  const datumBox = datumBoxFor(spec, m, measurements);

  for (const { side, target, el, edge } of spec.from) {
    const at = resolveTarget(side, target, el, edge, spec.anchor, measurements, vp);
    if (at == null) continue;

    const horiz = side === 'left' || side === 'right';
    const near = spec.anchor === 'center'
      ? (horiz ? box.x + box.w / 2 : box.y + box.h / 2)
      : side === 'left' ? box.x
        : side === 'right' ? box.x + box.w
          : side === 'top' ? box.y
            : box.y + box.h;

    // Gaps sit on the axis perpendicular to the extent dimensions so the two
    // families of annotation don't fight for the same lanes.
    const drawSide = horiz ? 'bottom' : 'right';
    out.push(makeRequest({
      key: `${spec.id}:from:${side}:${target}`, spec, fluid, side: drawSide,
      axis: horiz ? 'x' : 'y',
      a: Math.min(at, near), b: Math.max(at, near),
      edge: horiz ? datumBox.y + datumBox.h : datumBox.x + datumBox.w,
      out: 1,
      raw: Math.abs(near - at),
    }));
  }
}

/**
 * Where this spec's dimension lines hang from. Normally its own box; for a
 * feature that declares a datum, the datum's box instead, so the lines clear
 * the part the feature sits inside.
 */
function datumBoxFor(spec, m, measurements) {
  const dm = spec.datum && measurements.get(spec.datum);
  return dm?.ok ? dm.box : m.box;
}

function resolveTarget(side, target, el, edge, anchor, measurements, vp) {
  if (target === 'page' || target === 'viewport') {
    const inset = target === 'page' ? vp.frameInset : 0;
    switch (side) {
      case 'left': return inset;
      case 'right': return vp.vw - inset;
      case 'top': return inset;
      case 'bottom': return vp.docH - inset;
      default: return null;
    }
  }
  const tm = el && measurements.get(el);
  if (!tm?.ok) return null;
  const b = tm.box;
  const horiz = side === 'left' || side === 'right';

  // An explicitly named edge wins; then centre-to-centre if this spec is
  // centre-anchored (a hole pattern's pitch is centre to centre); otherwise
  // the target's facing edge, which is what neighbours want.
  const which = edge
    ?? (anchor === 'center' ? 'center' : OPPOSITE[side]);

  switch (which) {
    case 'left': return b.x;
    case 'right': return b.x + b.w;
    case 'top': return b.y;
    case 'bottom': return b.y + b.h;
    case 'center': return horiz ? b.x + b.w / 2 : b.y + b.h / 2;
    default: return null;
  }
}

function makeRequest({ key, spec, fluid, side, axis, a, b, edge, out, raw, timed }) {
  // A pixel span isn't always the meaningful quantity: a Gantt block's own
  // height is really a duration, so a "timed" axis displays the measured
  // px converted through the author's scale and unit instead of raw px.
  const value = timed ? raw * spec.scale : raw;
  const text = String(displayValue(key, value)) + (timed ? spec.unit : '');
  return {
    key, specId: spec.id, space: spec.space, priority: spec.priority,
    fluid, side, axis, a, b, edge, out,
    text,
    lane: null,
  };
}

function collectRadii({ spec, m, fluid }, out) {
  if (spec.radius === 'none') return;
  const corners = spec.radius === 'auto'
    ? distinctCorners(m.radii)
    : spec.radius;

  for (const corner of corners) {
    const prim = planRadius(m.box, corner, m.radii);
    if (prim) {
      out.push({ key: `${spec.id}:r:${corner}`, specId: spec.id, space: spec.space, fluid, prim });
    }
  }
}

/**
 * One callout per distinct radius value — the logo labels R64/R32/R16/R48
 * once each, not sixteen times.
 */
function distinctCorners(radii) {
  const seen = new Map();
  for (const c of ['tl', 'tr', 'br', 'bl']) {
    const v = Math.round(radii[c].x);
    if (v >= CONFIG.minRadiusPx && !seen.has(v)) seen.set(v, c);
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ */
/* Lane allocation                                                     */
/* ------------------------------------------------------------------ */

function crossFor(req, lane) {
  return req.edge + req.out * (CONFIG.baseGap + lane * CONFIG.laneStep);
}

function footprint(req, lane) {
  const cross = crossFor(req, lane);
  const band = CONFIG.labelSize + CONFIG.minGap / 2;
  const lo = Math.min(req.a, req.b) - CONFIG.minGap;
  const hi = Math.max(req.a, req.b) + CONFIG.minGap;
  return req.axis === 'x'
    ? { x0: lo, x1: hi, y0: cross - band, y1: cross + band }
    : { x0: cross - band, x1: cross + band, y0: lo, y1: hi };
}

const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy interval packing. Shorter spans take inner lanes so overall
 * dimensions get pushed outward — the logo's "320" sits furthest left.
 */
function allocateLanes(requests) {
  const placed = [];
  const order = [...requests].sort((p, q) =>
    (Math.abs(p.b - p.a) - Math.abs(q.b - q.a)) || (q.priority - p.priority));

  for (const req of order) {
    for (let lane = 0; lane < CONFIG.maxLanes; lane++) {
      const rect = footprint(req, lane);
      if (!placed.some((r) => hits(r, rect))) {
        req.lane = lane;
        placed.push(rect);
        break;
      }
    }
    if (req.lane == null) req.lane = CONFIG.maxLanes - 1;
  }
}

function buildLinear(req) {
  const cross = crossFor(req, req.lane);
  return planLinear({
    axis: req.axis,
    a: req.a,
    b: req.b,
    cross,
    extA: req.edge,
    extB: req.edge,
    out: req.out,
    text: req.text,
  });
}

/* ------------------------------------------------------------------ */
/* Label de-overlap                                                    */
/* ------------------------------------------------------------------ */

function labelBox(label) {
  const w = labelWidth(label.text);
  const h = CONFIG.labelSize;
  if (label.rot === -90) {
    // Rotated -90°, glyphs run bottom-to-top and rise toward -x.
    const y0 = label.anchor === 'middle' ? label.cy - w / 2
      : label.anchor === 'start' ? label.cy - w : label.cy;
    return { x0: label.cx - h * 0.8, x1: label.cx + h * 0.2, y0, y1: y0 + w };
  }
  const x0 = label.anchor === 'middle' ? label.cx - w / 2
    : label.anchor === 'end' ? label.cx - w : label.cx;
  return { x0, x1: x0 + w, y0: label.cy - h * 0.8, y1: label.cy + h * 0.2 };
}

/**
 * Overlapping lines read as an engineering drawing; overlapping *numbers*
 * read as broken. Slide colliding labels along their own dimension axis
 * (CAD-legal), then hide whatever still collides. n is small enough here
 * that a naive O(n^2) sweep is cheaper than maintaining a spatial index.
 */
function deoverlapLabels(prims) {
  const items = prims
    .filter((p) => p.prim?.label)
    .map((p) => ({ p, label: p.prim.label, box: labelBox(p.prim.label) }));

  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i];
        const B = items[j];
        if (!hits(A.box, B.box)) continue;

        // Push the later item along its own axis by the overlap.
        const vertical = B.label.rot === -90;
        const overlap = vertical
          ? Math.min(A.box.y1 - B.box.y0, B.box.y1 - A.box.y0)
          : Math.min(A.box.x1 - B.box.x0, B.box.x1 - A.box.x0);
        const shift = (overlap + 2) * (vertical
          ? (B.box.y0 < A.box.y0 ? -1 : 1)
          : (B.box.x0 < A.box.x0 ? -1 : 1));

        if (vertical) { B.label.y += shift; B.label.cy += shift; }
        else { B.label.x += shift; B.label.cx += shift; }
        B.box = labelBox(B.label);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Anything still colliding loses its label; the dimension line stays.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hits(items[i].box, items[j].box)) {
        items[j].label.hidden = true;
        items[j].box = { x0: 0, x1: 0, y0: 0, y1: 0 };
      }
    }
  }
}
