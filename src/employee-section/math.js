// Small numeric helpers shared by the slider modules.

/**
 * Longest frame step (s) that motion advances by. Real time is used up to
 * this (~10 fps); beyond it a frame was a stall or a tab switch, not motion.
 */
export const MAX_FRAME_DT = 0.1;

/** Frame-rate independent smoothing factor for `x += (target - x) * k`. */
export function expDamp(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

/** Modulo that is always positive (for wrapping). */
export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Run `fn` when the browser is idle (or after `timeout` ms at the latest). */
export function whenIdle(fn, timeout = 2000) {
  if ("requestIdleCallback" in window) return requestIdleCallback(fn, { timeout });
  return setTimeout(fn, 200);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
