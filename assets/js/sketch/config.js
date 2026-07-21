export const CONFIG = {
  // Dimension lanes: lane n sits at baseGap + n * laneStep outside the edge.
  baseGap: 16,
  laneStep: 24,
  maxLanes: 4,
  minGap: 12,

  // Extension lines start extGap off the geometry and overshoot the
  // dimension line by extOver — the convention the logo uses.
  extGap: 5,
  extOver: 7,

  arrowLen: 9,
  arrowHalfWidth: 3.2,

  labelPad: 7,
  labelSize: 13,
  labelLineHeight: 13,
  stubLen: 14,

  leaderLen: 26,
  landingLen: 14,

  dotRadius: 3,

  // Suppression thresholds.
  minSizePx: 48,
  minRadiusPx: 6,
  minDimPx: 24,
  maxLabels: 80,

  // Responsive tiers, keyed on documentElement.clientWidth. Annotations get
  // progressively simpler as the gutters they live in shrink; below the last
  // threshold there is no width left to draw a legible dimension in at all.
  tiers: [
    { min: 1024, positional: true, radius: true, dots: true, minPriority: 1 },
    { min: 768, positional: false, radius: true, dots: true, minPriority: 1 },
    { min: 400, positional: false, radius: false, dots: true, minPriority: 4 },
    { min: 0, positional: false, radius: false, dots: false, minPriority: 99 },
  ],
};

/** Advance width of Space Mono as a fraction of font-size. Refined at boot. */
let advance = 0.6;

/**
 * Measure the real monospace advance once, using an offscreen canvas so this
 * never triggers layout. Runs after fonts resolve — Space Mono may FOUT.
 */
export async function calibrate() {
  if (typeof document === 'undefined') return;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${CONFIG.labelSize}px "Space Mono", monospace`;
    const w = ctx.measureText('0000000000').width;
    if (w > 0) advance = w / 10 / CONFIG.labelSize;
  } catch {
    /* keep the default ratio */
  }
}

/** Pure arithmetic — safe to call inside the plan phase. */
export function labelWidth(text) {
  return String(text).length * advance * CONFIG.labelSize;
}

export function tierFor(viewportWidth) {
  return CONFIG.tiers.find((t) => viewportWidth >= t.min) ?? CONFIG.tiers.at(-1);
}
