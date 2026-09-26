// Runs `callback` once the browser has nothing more urgent to do (after first
// paint, hydration and any pending input), rather than after a fixed delay.
// `timeout` is only a ceiling so the work still starts on a permanently busy
// page. Returns a cancel function.
export function whenIdle(callback, timeout = 1500) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  // Safari: no idle callbacks - run after the next frame has painted
  let inner = 0;
  const outer = window.requestAnimationFrame(() => {
    inner = window.requestAnimationFrame(callback);
  });
  return () => {
    window.cancelAnimationFrame(outer);
    window.cancelAnimationFrame(inner);
  };
}
