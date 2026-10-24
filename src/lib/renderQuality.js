// Adaptive render resolution for the full-screen shaders (the intro loader
// and the page transition). One shared setting, so what the loader learns
// about the device also applies to the page transitions.
//
// Start: the device pixel ratio, capped at 1.5 (soft organic shapes gain
// nothing above that) and at a pixel budget, so big Retina / 4K screens
// don't shade 8M+ pixels a frame. Hardware hints (cores, memory - never the
// user agent) start weaker devices one step lower.
// Then measured: frames that run well under target ask for one step down
// (never up again, so quality never flickers). Callers apply a new ratio
// only at moments where the change can't be seen.

const MAX_RATIO = 1.5;
const MIN_RATIO = 0.6;
const PIXEL_BUDGET = 4.5e6; // shaded pixels per frame on a capable device
const STEP = 0.8; // each step down shades ~36% fewer pixels

let cap = null;

function initialCap() {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8; // Chromium only; absent = no hint
  let ratio = MAX_RATIO;
  if (cores <= 4 || memory <= 4) ratio *= STEP;
  return ratio;
}

/** The pixel ratio to render a full-screen shader at, right now. */
export function renderPixelRatio() {
  if (cap === null) cap = initialCap();
  const dpr = window.devicePixelRatio || 1;
  const area = Math.max(1, window.innerWidth * window.innerHeight);
  // the budget only trims high-DPI extra resolution, never below 1x - a big
  // 1x screen keeps native detail; FrameWatch catches it if that is slow
  const budget = Math.max(1, Math.sqrt(PIXEL_BUDGET / area));
  return Math.max(MIN_RATIO, Math.min(dpr, cap, budget));
}

/** Measured frames were too slow: render one step lower from now on. */
export function stepDown() {
  if (cap === null) cap = initialCap();
  const next = Math.max(MIN_RATIO, cap * STEP);
  const changed = next < cap;
  cap = next;
  return changed;
}

/**
 * Watches frame intervals and calls stepDown() when the median of a window
 * misses the target; returns true from sample() when it did.
 */
export class FrameWatch {
  constructor({ targetMs = 1000 / 45, window = 10 } = {}) {
    this.targetMs = targetMs;
    this.size = window;
    this.samples = [];
    this.last = 0;
  }

  reset() {
    this.samples.length = 0;
    this.last = 0;
  }

  sample(now) {
    const dt = this.last ? now - this.last : 0;
    this.last = now;
    // a hidden tab or a one-off stall is not a slow device
    if (!dt || dt > 1000) return false;
    this.samples.push(dt);
    if (this.samples.length < this.size) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples.length = 0;
    return median > this.targetMs && stepDown();
  }
}
