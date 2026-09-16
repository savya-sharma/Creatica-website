// Shared handle to the single Lenis instance created by SmoothScroll, so
// other components can react to the *same* smoothed scroll stream instead of
// each wiring up their own competing scroll/wheel listener.
export const lenisStore = { instance: null };

export const LENIS_READY_EVENT = "lenis:ready";

// Runs `callback` with the live Lenis instance, now if it already exists or
// as soon as SmoothScroll creates it, and returns a cleanup function.
export function onLenisReady(callback) {
  if (lenisStore.instance) {
    callback(lenisStore.instance);
    return () => {};
  }

  const handleReady = (e) => callback(e.detail);
  window.addEventListener(LENIS_READY_EVENT, handleReady);
  return () => window.removeEventListener(LENIS_READY_EVENT, handleReady);
}
