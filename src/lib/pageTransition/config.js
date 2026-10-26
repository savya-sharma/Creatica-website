// Every knob for the organic page transition in one place
// (controller.js, shader.js, components/PageTransition.jsx): blobs
// grow from set points over the page, the page switches, then it opens from
// the centre back out to the borders.
export const TRANSITION_CONFIG = {
  enabled: true,

  // Grayscale noise that distorts the edge. Any image works - drop
  // a different file at this path (or point this elsewhere). It is tiled
  // mirrored, so it needn't be seamless. If it fails to load, a generated
  // noise is used instead.
  noiseTexture: "/textures/noise2.jpg",
  noiseIntensity: 0.52, // how strongly the noise bends the edge (0 = a clean circle)
  noiseScale: 1.1, // texture repeats across the screen height
  noiseSmoothing: 1.2, // samples a blurrier copy of the texture: higher = smoother shapes
  moveSpeed: 0.6, // how fast the edges drift and deform (0 = still)

  color: "#99a395", // the cover
  color2: "#586a6b", // its second tone, blended in soft organic areas
  twoTone: 1, // how strongly the second tone shows (0 = one flat colour)
  rimColor: "#586a6b", // a faint band along the edge

  // the cover: blobs appear at these points (screen fractions, 0..1 from the
  // top-left), each after its own delay (share of the cover), swell and merge
  // until the screen is covered. size scales a blob (1 = coverReach). Max 8.
  coverPoints: [
    { x: 0.24, y: 0.3, delay: 0 },
    { x: 0.72, y: 0.24, delay: 0.1 },
    { x: 0.5, y: 0.62, delay: 0.04 },
    { x: 0.86, y: 0.74, delay: 0.18 },
    { x: 0.12, y: 0.8, delay: 0.14 },
    { x: 0.46, y: 0.06, delay: 0.24 },
    { x: 0.64, y: 0.94, delay: 0.26 },
  ],
  coverReach: 0.52, // a blob's full-grown radius, in screen heights

  edgeSoftness: 0.014, // soft edge width, in screen heights (0 = just anti-aliased)

  // fine grain along the moving edge (none in the cover's interior or on the page)
  grain: 0.26, // strength at the edge (0 = off)
  grainScale: 1.9, // grain size, in CSS pixels
  grainSpeed: 2.0, // how fast it drifts, in grains per second (0 = still)
  grainWidth: 0.024, // how far from the edge it reaches, in screen heights

  coverDuration: 0.3, // seconds, the blobs growing over the old page
  revealDuration: 0.3, // seconds, opening from the centre onto the new page
  coverEase: "sine.inOut", // even pace: soft start, soft finish (power2.in sped up at the end)
  revealEase: "sine.inOut", // same pace as the cover

  minCoverMs: 300, // the cover holds at least this long once complete
  settleMaxMs: 900, // longest wait for the new page's start-up work to settle before the reveal
  readyTimeoutMs: 2500, // longest wait for fonts / on-screen images to decode
  maxWaitMs: 8000, // a page that never arrives is revealed anyway after this

  // debugging: a number 0..1 freezes the cover at that progress on screen
  progress: null,
};
