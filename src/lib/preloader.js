// Cross-component signal for "the entry preloader has finished". Preloader
// and the Hero are siblings under RootLayout (not parent/child), so there is
// no prop to pass this through - mirrors the onLenisReady pattern in
// lib/lenis.js: a plain module-scope flag plus a DOM CustomEvent, so a
// listener added after the event already fired still gets called immediately
// instead of waiting forever. The module itself is only ever loaded fresh on
// a real document load, so `done` naturally resets there and stays true
// across client-side navigation within the same page load - exactly the
// "did the loader already run this visit" the Hero's reveal needs, with no
// sessionStorage/localStorage involved.
const PRELOADER_DONE_EVENT = "preloader:done";

const state = { done: false };

export function markPreloaderDone() {
  if (state.done) return;
  state.done = true;
  window.dispatchEvent(new CustomEvent(PRELOADER_DONE_EVENT));
}

// Calls `callback` the moment the preloader finishes; if it already has
// (e.g. this component mounted late, or after a client-side nav back to a
// page that mounts it), calls back immediately instead of missing the event.
export function onPreloaderDone(callback) {
  if (state.done) {
    callback();
    return () => {};
  }
  window.addEventListener(PRELOADER_DONE_EVENT, callback, { once: true });
  return () => window.removeEventListener(PRELOADER_DONE_EVENT, callback);
}

export function preloaderIsDone() {
  return state.done;
}
