// Every knob for the organic blob page transition in one place
// (controller.js, shader.js, components/PageTransition.jsx).
export const TRANSITION_CONFIG = {
  enabled: true,

  // Grayscale noise that distorts the blob outlines. Any image works - drop
  // a different file at this path (or point this elsewhere). It is tiled
  // mirrored, so it needn't be seamless. If it fails to load, a generated
  // noise is used instead.
  noiseTexture: "/textures/noise2.jpg",
  noiseIntensity: 0.32, // how strongly the noise bends the outlines (0 = round blobs)
  noiseScale: 1.1, // texture repeats across the screen height
  noiseSmoothing: 1.2, // samples a blurrier copy of the texture: higher = smoother shapes
  moveSpeed: 0.6, // how fast the edges drift and deform (0 = still)

  color: "#072f33", // the cover
  rimColor: "#586a6b", // a faint lighter band along the blob edges

  pointCount: 12, // blobs per phase (max 32)
  seed: null, // a number repeats the same pattern every time; null varies it
  blobScale: 0.2, // a blob's full-grown radius, in screen heights
  edgeSoftness: 0.02, // feathered edge width, as a share of the blob size (0 = just anti-aliased)

  coverDuration: 1.2, // seconds, blobs growing over the old page
  revealDuration: 1.45, // seconds, the new page opening through the blobs
  coverEase: "power2.in",
  revealEase: "power2.out",

  minCoverMs: 300, // the cover holds at least this long once complete
  readyTimeoutMs: 2500, // longest wait for fonts / on-screen images to decode
  maxWaitMs: 8000, // a page that never arrives is revealed anyway after this

  // debugging: a number 0..1 freezes the cover at that progress on screen
  progress: null,
};
