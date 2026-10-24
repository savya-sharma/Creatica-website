// Real loading progress for the intro: each signal adds its weight when it
// resolves (or when its own deadline passes - a stalled or failed asset never
// holds the site hostage). Resolves once all have.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frames = (n) =>
  new Promise((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

const windowLoaded = () =>
  document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));

// the home hero is ready once its WebGL headline is drawn (.hero-troika-ready,
// HeroFluid.jsx) - only where that runs at all (a mouse, motion allowed);
// other pages and devices just need to have painted
function heroReady() {
  const hero = document.querySelector(".hero");
  const fluid =
    hero &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    typeof window.WebGL2RenderingContext !== "undefined";
  if (!fluid) return frames(2);
  if (hero.classList.contains("hero-troika-ready")) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!hero.classList.contains("hero-troika-ready")) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(hero, { attributes: true, attributeFilter: ["class"] });
  });
}

/**
 * @param {number} timeoutMs - per-signal deadline
 * @param {(fraction: number) => void} onProgress - 0..1 as signals land
 * @param {Promise[]} extra - more signals (e.g. the reveal's texture)
 */
export function trackReadiness(timeoutMs, onProgress, extra = []) {
  const signals = [
    [0.1, Promise.resolve()], // the document is parsed and running
    [0.25, document.fonts ? document.fonts.ready : Promise.resolve()],
    [0.35, windowLoaded()],
    [0.2, heroReady()],
    ...extra.map((p) => [0.1 / Math.max(extra.length, 1), p]),
  ];
  const total = signals.reduce((sum, [w]) => sum + w, 0);
  let done = 0;
  return Promise.all(
    signals.map(([weight, promise]) =>
      Promise.race([Promise.resolve(promise).catch(() => {}), wait(timeoutMs)]).then(() => {
        done += weight;
        onProgress(done / total);
      }),
    ),
  );
}
