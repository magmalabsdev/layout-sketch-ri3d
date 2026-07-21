import { parseSpec, DIM_ATTRS } from './schema.js';
import { bumpEpoch, resolveRadii } from './measure.js';

let specs = [];
const known = new WeakMap();

/** Pattern descriptor for the top-left instance of a uniform repeat group. */
const patternInfo = new WeakMap();

/** Restricts a non-representative instance to only its varying axis. */
const sizeOverride = new WeakMap();

/** Marks a non-representative instance whose fillet is shared, not its own. */
const noRadius = new WeakMap();

const UNIFORM_EPS = 1.5; // px tolerance for "same size" between instances

/** [tl, tr, br, bl] rendered radius (post overlap-scaling) for one element. */
function measuredRadii(el, rect) {
  const cs = getComputedStyle(el);
  const r = resolveRadii({
    borderTopLeftRadius: cs.borderTopLeftRadius,
    borderTopRightRadius: cs.borderTopRightRadius,
    borderBottomRightRadius: cs.borderBottomRightRadius,
    borderBottomLeftRadius: cs.borderBottomLeftRadius,
  }, rect.width, rect.height);
  return [r.tl.x, r.tr.x, r.br.x, r.bl.x].map((v) => Math.round(v));
}

/**
 * Classifies one `data-dim-repeat="first"` container by measuring its
 * `[data-dim-child]` items, per axis:
 *
 * - Width AND height both uniform -> a true linear/grid pattern. Dimension
 *   only the top-left instance, plus the pitch to its row/column neighbour
 *   and an "Nx" count leader — the CAD convention for a repeat of identical
 *   features, not a full dimension set stacked N times.
 * - Exactly one axis uniform (e.g. filter chips: same height, width follows
 *   the label) -> that shared axis only needs stating once, on the
 *   top-left instance. Every other instance is redimensioned only on the
 *   axis that actually differs between them.
 * - Neither axis uniform -> no dimension describes more than one instance,
 *   so every instance gets its own full dimension set.
 *
 * Independently of the above, a fillet shared by every instance (common —
 * a design system's buttons usually all round the same amount regardless of
 * box size) is likewise only worth stating once: whenever every instance
 * resolves to the same rendered corner radii, only the top-left instance
 * gets a radius callout, whatever branch its width/height fall into.
 */
function classifyRepeat(container) {
  const children = [...container.children].filter((c) => c.matches('[data-dim-child]'));
  children.forEach((c) => { sizeOverride.delete(c); noRadius.delete(c); });

  if (children.length < 2) {
    children.forEach((c, i) => c.toggleAttribute('data-dim', i === 0));
    if (children[0]) patternInfo.delete(children[0]);
    return;
  }

  const rects = children.map((el) => ({ el, r: el.getBoundingClientRect() }));
  const { width: w0, height: h0 } = rects[0].r;
  const widthUniform = rects.every(({ r }) => Math.abs(r.width - w0) < UNIFORM_EPS);
  const heightUniform = rects.every(({ r }) => Math.abs(r.height - h0) < UNIFORM_EPS);

  const radii = rects.map(({ el, r }) => measuredRadii(el, r));
  const radiusUniform = radii.every((r) => r.every((v, i) => v === radii[0][i]));

  // Geometric top-left, needed in every branch below: bucket into rows by
  // top coordinate (tolerant of sub-pixel drift), then sort left-to-right,
  // so the reading order matches the grid's actual visual layout rather
  // than raw DOM order.
  const byTop = [...rects].sort((a, b) => a.r.top - b.r.top);
  const rowTol = Math.min(...rects.map(({ r }) => r.height)) / 2;
  const rows = [];
  for (const item of byTop) {
    const row = rows.find((r) => Math.abs(r[0].r.top - item.r.top) < rowTol);
    if (row) row.push(item); else rows.push([item]);
  }
  rows.forEach((row) => row.sort((a, b) => a.r.left - b.r.left));
  const topLeft = rows[0][0].el;

  if (widthUniform && heightUniform) {
    children.forEach((c) => c.toggleAttribute('data-dim', c === topLeft));
    patternInfo.set(topLeft, {
      count: children.length,
      colTarget: rows[0].length > 1 ? rows[0][1].el : null,
      rowTarget: rows.length > 1 ? rows[1][0].el : null,
    });
    return;
  }

  patternInfo.delete(topLeft);

  // From here on more than one instance gets data-dim, so a shared fillet
  // needs suppressing on every instance but the representative one.
  if (radiusUniform) {
    children.forEach((c) => { if (c !== topLeft) noRadius.set(c, true); });
  }

  if (widthUniform || heightUniform) {
    const varying = widthUniform ? 'h' : 'w';
    children.forEach((c) => {
      c.setAttribute('data-dim', '');
      if (c !== topLeft) sizeOverride.set(c, varying);
    });
    return;
  }

  children.forEach((c) => c.setAttribute('data-dim', ''));
}

function expandRepeats(root) {
  for (const container of root.querySelectorAll('[data-dim-repeat="first"]')) {
    classifyRepeat(container);
  }
}

export function rescan(root = document.body) {
  expandRepeats(root);

  const next = [];
  for (const el of root.querySelectorAll('[data-dim]')) {
    let spec = known.get(el);
    if (!spec || spec.dirty) {
      spec = parseSpec(el);
      known.set(el, spec);
    }

    // Reassigned fresh every scan (not conditionally), so a spec that no
    // longer needs restricting reverts to its authored size instead of
    // staying stuck on whatever axis it was last limited to.
    spec.sizeOverride = sizeOverride.get(el) ?? null;
    spec.suppressRadius = noRadius.has(el);

    const pattern = patternInfo.get(el);
    // Drop any pitch entries from a previous scan before re-adding, so a
    // cached spec doesn't accumulate duplicates every time this runs.
    spec.from = spec.from.filter((f) => !f.pattern);
    if (pattern) {
      spec.pattern = pattern;
      if (pattern.colTarget) {
        spec.from.push({ side: 'right', target: 'pattern-col', el: pattern.colTarget, pattern: true });
      }
      if (pattern.rowTarget) {
        spec.from.push({ side: 'bottom', target: 'pattern-row', el: pattern.rowTarget, pattern: true });
      }
    } else {
      delete spec.pattern;
    }

    next.push(spec);
  }
  specs = next;
  return specs;
}

/** Marks an element's spec for re-parsing on the next scan. */
export function invalidateSpec(el) {
  const spec = known.get(el);
  if (spec) spec.dirty = true;
}

/** Specs eligible to draw at this viewport width. */
export function active(vp) {
  return specs.filter((s) => {
    if (!s.el.isConnected) return false;
    if (s.vw && (vp.vw < s.vw.min || vp.vw > s.vw.max)) return false;
    return true;
  });
}

export function all() {
  return specs;
}

export function observe(invalidate, Reason) {
  const ro = new ResizeObserver(() => {
    bumpEpoch();
    invalidate(Reason.RESIZE);
  });
  ro.observe(document.documentElement);

  const mo = new MutationObserver((records) => {
    for (const r of records) {
      // The overlay writes into the DOM this observer watches. Without this
      // guard the engine retriggers itself forever.
      const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (target?.closest?.('[data-sketch-layer]')) continue;
      if (r.type === 'attributes' && target) invalidateSpec(target);
      bumpEpoch();
      invalidate(Reason.MUTATE);
      return;
    }
  });
  mo.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...DIM_ATTRS, 'class', 'style', 'hidden', 'open'],
  });

  // Capture phase: scroll events from nested overflow:auto containers do not
  // bubble, but they do capture.
  addEventListener('scroll', () => invalidate(Reason.SCROLL), { passive: true, capture: true });
  addEventListener('resize', () => {
    bumpEpoch();
    invalidate(Reason.RESIZE);
  }, { passive: true });

  // iOS collapses its toolbar without firing a window resize.
  visualViewport?.addEventListener('resize', () => invalidate(Reason.RESIZE));
  visualViewport?.addEventListener('scroll', () => invalidate(Reason.SCROLL));

  // Space Mono loading shifts every text-sized element.
  document.fonts?.addEventListener?.('loadingdone', () => {
    bumpEpoch();
    invalidate(Reason.FONT);
  });

  return () => {
    ro.disconnect();
    mo.disconnect();
  };
}

/** An undecoded image measures 0x0 and would paint a wrong number, then flicker. */
export function watchImages(invalidate, Reason) {
  for (const img of document.querySelectorAll('img[data-dim]')) {
    if (img.complete) continue;
    img.addEventListener('load', () => invalidate(Reason.MUTATE), { once: true });
    img.addEventListener('error', () => invalidate(Reason.MUTATE), { once: true });
  }
}
