import { CONFIG, calibrate, tierFor } from './config.js';
import * as registry from './registry.js';
import { measureViewport, measureBatch, bumpEpoch } from './measure.js';
import { buildPlan } from './layout.js';
import { createLayers, sizeLayers, paint, clear } from './render.js';

/**
 * Layout Sketch annotation engine.
 *
 * Pipeline: invalidate -> rAF coalesce -> read -> plan -> paint. The phases
 * are kept strictly separate so a page with dozens of annotations never
 * interleaves reads and writes and thrashes layout.
 */

export const Reason = { RESIZE: 1, SCROLL: 2, MUTATE: 4, FONT: 8, MANUAL: 16 };

let layers = null;
let started = false;
let enabled = true;
let pending = 0;
let rafId = 0;
let frameInset = CONFIG.frameInset ?? 6;

function invalidate(reason) {
  if (!enabled || !started) return;
  pending |= reason;
  if (rafId) return;
  rafId = requestAnimationFrame(flush);
}

function flush() {
  rafId = 0;
  const reason = pending;
  pending = 0;

  // ---- READ ----
  const vp = measureViewport(frameInset);
  const tier = tierFor(vp.vw);

  if (!tier.dots && !tier.radius && tier.minPriority > 10) {
    clear();
    return;
  }
  if (reason & (Reason.MUTATE | Reason.FONT)) registry.rescan();

  const specs = registry.active(vp);
  const measurements = measureBatch(specs, vp);
  const entries = specs.map((spec) => ({ spec, m: measurements.get(spec.el) }));

  // ---- PLAN (pure) ----
  const plan = buildPlan(entries, measurements, vp, tier);

  // ---- WRITE ----
  sizeLayers(layers, vp);
  paint(layers, plan);
}

function readFrameInset() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--sk-frame').trim();
  return parseFloat(raw) || 6;
}

export function init() {
  if (started) return api;
  started = true;

  layers = createLayers();
  frameInset = readFrameInset();

  registry.rescan();
  registry.observe(invalidate, Reason);
  registry.watchImages(invalidate, Reason);

  invalidate(Reason.MANUAL);
  // Label widths are arithmetic off the monospace advance, so recalibrate and
  // repaint once the real font has resolved.
  calibrate().then(() => invalidate(Reason.FONT));

  return api;
}

const api = {
  init,
  /** Call after injecting JSON-driven DOM. */
  rescan() {
    bumpEpoch();
    registry.rescan();
    registry.watchImages(invalidate, Reason);
    invalidate(Reason.MUTATE);
  },
  refresh() {
    bumpEpoch();
    invalidate(Reason.MANUAL);
  },
  setEnabled(next) {
    enabled = next;
    document.documentElement.classList.toggle('sk-off', !next);
    if (next) invalidate(Reason.MANUAL);
    else clear();
  },
};

export const Sketch = api;

if (typeof window !== 'undefined') window.Sketch = api;
export default api;
