// Every knob for the first-visit intro (components/IntroLoader.jsx):
// black screen -> square-to-circle dial counting 0-100% -> dial fades ->
// organic shader reveal from the centre. Independent of the page
// transition (lib/pageTransition).
export const INTRO_CONFIG = {
  storageKey: "cc-intro-done", // sessionStorage: the intro has played this session
  // true: every full page load (reloads, direct links) plays the whole
  // dial + reveal; false: later loads this session get only a quick reveal.
  // Internal navigation never shows the intro either way.
  dialEveryLoad: true,

  // -- dial ----------------------------------------------------------------
  minDialMs: 2200, // the count never reaches 100% faster than this
  holdMs: 350, // pause on 100% before the dial fades
  dialFadeMs: 500,
  countFollow: 4, // how quickly the count eases toward the real progress
  pauseAt: 64, // the count holds on this number for a beat (0 = no pause)
  pauseMs: 600, // how long it holds there

  // -- readiness (each signal resolves on its own deadline if it stalls) ---
  signalTimeoutMs: 6000,
  maxIntroMs: 12000, // the intro finishes by this time no matter what

  // -- shader: fluid marble flow field (lib/introLoader/shader.js) ----------
  // flows behind the dial for the whole countdown, then dissolves centre-out
  // into the hero along its own field
  color: "#586a6b", // the overlay colour it fades in from (keep = .intro's CSS background)
  darkColor: "#586a6b", // the dark regions
  silverColor: "#99a395", // the light bands and their striations
  accentColor: "#af2ad4", // muted amber seams
  darkness: 0.6, // how much of the screen stays dark (0..1, higher = darker)
  contrast: 0.7, // sharpness of the dark/silver boundaries (0..1)
  flowScale: 0.9, // main flow-field scale (higher = smaller forms)
  warp: 1.0, // domain-warp intensity: folds and pinches
  striationDensity: 220, // fine striations across the field (higher = finer, denser)
  striationWidth: 0.3, // striation thickness, as a share of their spacing (0..1)
  striationContrast: 0.38, // how strongly the striations show (0..1)
  flowSpeed: 0.06, // overall flow speed (0 = still)
  deform: 1.0, // large-scale deformation
  detail: 0.5, // fine-detail intensity: variation in line spacing and brightness
  accentIntensity: 0.8, // amber seam strength (0 = none)
  accentCoverage: 0.22, // share of the dark/silver boundaries that get a seam (0..1)
  accentWidth: 0.014, // amber seam width, in field units
  grain: 0.06, // grain intensity
  grainScale: 1.0, // grain size, in CSS pixels
  seed: 1, // a different marble
  emergeDuration: 0.8, // seconds, base colour -> contours as the loader appears
  revealDuration: 1.9, // seconds, the dissolve into the hero (first visit)
  quickRevealDuration: 0.9, // the dissolve on later loads, if dialEveryLoad is off
  revealEase: "power2.inOut",
  revealSoftness: 0.035, // dissolve edge softness, in field units

  // reduced motion: no dial, no shader - a short fade once ready
  reducedFadeMs: 400,
};
