import { CONFIG } from './config.js';

/** READ PHASE ONLY. Every DOM read in the engine happens here. */

/** getComputedStyle is the expensive read, so cache it against an epoch that
 *  bumps on mutation/resize but never on scroll. */
const styleCache = new WeakMap();
let epoch = 0;

export function bumpEpoch() {
  epoch++;
}

export function measureViewport(frameInset) {
  const de = document.documentElement;
  return {
    // clientWidth EXCLUDES the classic scrollbar; innerWidth does not, which
    // would make every distance-to-right-wall wrong by ~15px.
    vw: de.clientWidth,
    vh: window.visualViewport?.height ?? de.clientHeight,
    sx: window.scrollX,
    sy: window.scrollY,
    docW: de.scrollWidth,
    docH: de.scrollHeight,
    frameInset,
  };
}

/**
 * Resolve border-radius the way the browser actually renders it.
 *
 * When adjacent radii exceed an edge length, CSS scales *all* of them by a
 * common factor (CSS Backgrounds 3 §5.5). The computed value is therefore not
 * the rendered value — without this, a pill button reports R9999 and points at
 * a corner that renders far smaller.
 */
export function resolveRadii(cs, w, h) {
  const px = (v, base) => {
    if (!v) return 0;
    return v.endsWith('%') ? (parseFloat(v) / 100) * base : parseFloat(v) || 0;
  };
  const pair = (v, bx, by) => {
    const parts = String(v).split(/\s+/);
    return { x: px(parts[0], bx), y: px(parts[1] ?? parts[0], by) };
  };

  const tl = pair(cs.borderTopLeftRadius, w, h);
  const tr = pair(cs.borderTopRightRadius, w, h);
  const br = pair(cs.borderBottomRightRadius, w, h);
  const bl = pair(cs.borderBottomLeftRadius, w, h);

  const q = (num, den) => (den > 0 ? num / den : Infinity);
  const f = Math.min(1,
    q(w, tl.x + tr.x), q(w, bl.x + br.x),
    q(h, tl.y + bl.y), q(h, tr.y + br.y));
  const s = (c) => ({ x: c.x * f, y: c.y * f });

  return { tl: s(tl), tr: s(tr), br: s(br), bl: s(bl), scaled: f < 1 };
}

function readStyle(el) {
  const cached = styleCache.get(el);
  if (cached && cached.epoch === epoch) return cached;
  const cs = getComputedStyle(el);
  const entry = {
    epoch,
    radii: {
      borderTopLeftRadius: cs.borderTopLeftRadius,
      borderTopRightRadius: cs.borderTopRightRadius,
      borderBottomRightRadius: cs.borderBottomRightRadius,
      borderBottomLeftRadius: cs.borderBottomLeftRadius,
    },
    border: {
      top: parseFloat(cs.borderTopWidth) || 0,
      right: parseFloat(cs.borderRightWidth) || 0,
      bottom: parseFloat(cs.borderBottomWidth) || 0,
      left: parseFloat(cs.borderLeftWidth) || 0,
    },
    visible: cs.visibility !== 'hidden' && cs.display !== 'none',
  };
  styleCache.set(el, entry);
  return entry;
}

export function measureElement(el, vp) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return { ok: false };

  const style = readStyle(el);
  if (!style.visible) return { ok: false };

  const isFixed = el.dataset.dimSpace === 'fixed';
  return {
    ok: true,
    rect,
    // Fixed-layer coordinates are raw viewport coordinates; doc-layer
    // coordinates are offset by scroll so the layer scrolls with the page.
    box: {
      x: rect.left + (isFixed ? 0 : vp.sx),
      y: rect.top + (isFixed ? 0 : vp.sy),
      w: rect.width,
      h: rect.height,
    },
    radii: resolveRadii(style.radii, rect.width, rect.height),
    border: style.border,
  };
}

/** Batch every read for this frame in one pass. */
export function measureBatch(specs, vp) {
  const out = new Map();
  for (const spec of specs) {
    out.set(spec.el, measureElement(spec.el, vp));
    for (const f of spec.from) {
      if (f.el && !out.has(f.el)) out.set(f.el, measureElement(f.el, vp));
    }
    if (spec.datum && !out.has(spec.datum)) {
      out.set(spec.datum, measureElement(spec.datum, vp));
    }
  }
  return out;
}

export { CONFIG };
