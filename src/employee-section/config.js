// Every tunable value of the carousel lives here. Geometry is in world units
// where one plane is 1 wide; motion is in "planes" (one pitch step).
//
// Formation: planes travel along a curve seen from above, front at z = 0,
// facing a camera at +z (see formation.js). The default "bump" values were
// fitted to the reference image (plane positions, heights and widths,
// including the cut-off planes at both ends):
//
//   bump depth 1.4 (since raised to 1.65 for more depth), width 1.78, gap ~10%, camera 3 plane-widths away,
//   rotation = exact curve tangent, ~3.5 planes per side, outer planes ~72%
//   of centre height, turned ~10deg and cut by the frame edge.

export const CAROUSEL_CONFIG = {
  // --- geometry -------------------------------------------------------------
  profile: "bump", // "bump" (matches the reference) | "cylinder"
  bumpDepth: 1.65, // how far the sides sit behind the centre (fitted 1.4; deepened from the 2nd gap outward)
  bumpWidth: 1.78, // centre bulge width; tangent angle peaks around here
  radius: 3, // only for profile: "cylinder"
  planeWidth: 1,
  planeHeight: 1.25, // 4:5 portrait
  gap: 0.025, // between planes, as a fraction of planeWidth (measured along the curve): tight editorial spacing
  rotationFactor: 1, // 1 = planes exactly tangent to the curve
  // 1 = each plane is bent along the curve (smooth, wavy top/bottom edges, as
  // in the reference); 0 = flat cards. Done in the vertex shader.
  curveBend: 1,
  verticalLift: 0.05, // outer planes rise this share of planeHeight at full depth
  scaleFalloff: 0, // optional extra shrink at the frame edge; perspective does it

  // --- camera ---------------------------------------------------------------
  cameraZ: 3, // distance from the front of the curve
  // "auto": derive the vertical FOV so frameHalfWidth is visible either side
  // of the centre at any stage aspect. A number pins the FOV instead.
  cameraFov: "auto",
  frameHalfWidth: 2.58, // world units visible each side of the centre at z = 0

  // --- motion ---------------------------------------------------------------
  autoSpeed: 0.16, // planes per second, right -> left
  positionDamping: 30, // visual transform chasing its target (1/s)
  rotationDamping: 30,
  scaleDamping: 8,
  dragSensitivity: 1, // 1 = the centre plane tracks the pointer 1:1
  dragFollow: 75, // logical offset chasing the pointer (1/s)
  dragFriction: 5.5, // inertia decay after release (1/s)
  maxVelocity: 14, // planes per second

  // --- portrait framing (see framePortrait in imageCache.js) -----------------
  // Uses each employee's `focus` (data.js) so every head sits on the same line.
  headTop: 0.1, // top of the head, as a share of plane height from the top
  headSize: 0.25, // head (top to chin) as a share of plane height
  minCropPx: 700, // never zoom in further than this many source pixels tall
  pngBackground: "#ffffff", // headroom fill, only for PNGs whose own background is white

  // --- captions (captions.js) --------------------------------------------------
  labels: true, // name + role under each plane
  labelFontFamily: '"AppleRegular", serif', // drawn into a canvas (captions.js)
  labelSize: 0.055, // role text size in world units (a plane is 1 wide)
  labelGap: 0.035, // space between the image bottom and its role text
  viewShiftY: 0.1, // lens-shift the image up (world units) to make room for captions

  // --- fluid image distortion (fluid.js + image shader) ----------------------
  // One shared velocity field over the visible ribbon; the mouse injects its
  // velocity, the field advects/swirls/decays, the portraits are displaced,
  // smeared and RGB-split by it. Speeds are world units per second (a plane
  // is 1 wide); "seconds" values turn a flow speed into a world offset.
  fluid: true,
  fluidCellSize: 0.04, // world units per simulation cell (smaller = finer, costlier)
  fluidStrength: 1, // share of the mouse velocity injected
  fluidInjection: 16, // how fast the field takes on the stroke's velocity (1/s)
  fluidRadius: 0.09, // stroke width (world)
  fluidStretch: 0.6, // extra stroke length along the direction, per world/s of speed
  fluidTurbulence: 0.15, // irregular sideways component injected with the stroke
  fluidNoiseScale: 2.5, // size of that irregularity (low = broad, no grain)
  fluidAdvection: 1, // how strongly the field carries itself (1 = physical)
  fluidDissipation: 1.5, // field decay per second (lower = longer memory)
  fluidVelocityDamping: 14, // smoothing of the mouse velocity (1/s)
  mouseSmoothing: 26, // smoothing of the mouse position (1/s)
  maxMouseSpeed: 7, // clamp on the injected speed (world/s)
  fluidMinSpeed: 0.35, // strokes slower than this inject nothing (above the auto-scroll drift)
  fluidVorticity: 4, // vorticity confinement: swirls (high values turn grainy)
  fluidPressure: 0.8, // share of the pressure gradient removed (incompressibility)
  fluidPressureIterations: 10,
  vertexDisplacement: 0.015, // s: flow -> how far the mesh is pushed along the stroke
  vertexDepth: 0.012, // s: flow speed -> how far the surface dents into depth
  maxVertexDisplacement: 0.035, // world units, cap on the mesh deformation
  distortionStrength: 0.003, // s: extra fine warp in the image on top of the mesh
  smearStrength: 0.0055, // s
  chromaticStrength: 0.002, // s
  chromaticThreshold: 1.6, // world/s where the RGB split begins
  maxDistortion: 0.03, // world units, hard cap on displacement/smear
  captionDistortion: 0.01, // s: flow -> caption glyph displacement
  captionChroma: 0.005, // s: flow -> caption RGB split
  maxCaptionOffset: 0.025, // world units, cap on caption displacement
  captionGrain: 0.15, // RGB grain on captions (the portraits use fluidGrain)
  fluidGrain: 0.2, // RGB grain strength where the fluid moves (0 = off)
  fluidGrainSize: 1.5, // grain size in screen pixels
  fluidGrainFlow: 0.9, // flow speed (world/s) at which the grain is at full strength
  fluidGrainFps: 24, // grain refresh rate (film-like)

  // --- look -----------------------------------------------------------------
  edgeFade: 0, // the reference cuts planes hard at the frame; >0 dissolves them
  borderAlpha: 0.22,

  // Narrower viewports keep the same shape with fewer planes on screen: the
  // visible half-width shrinks and the bulge tightens to match. First match wins.
  responsive: [
    // phone: centre plane + turned neighbours cut by the frame
    { maxWidth: 639, frameHalfWidth: 1.3, bumpDepth: 1.12, bumpWidth: 1.0, labelSize: 0.075, viewShiftY: 0.14 },
    // tablet: ~2.5 planes per side
    { maxWidth: 1023, frameHalfWidth: 2.0, bumpDepth: 1.42, bumpWidth: 1.45 },
  ],
};

// Mouse-driven smoke behind the whole About page (backgroundFluid.js). Same
// fluid engine as the portraits, plus a dye channel. Units: 1 = 100 CSS px.
export const BACKGROUND_FLUID_CONFIG = {
  enabled: true,
  color: "#efece6", // smoke tint (warm off-white)
  intensity: 0.32, // max smoke opacity over the page background
  resolutionScale: 0.5, // canvas resolution vs CSS px (smoke is soft anyway)
  cellSize: 0.1, // 10 CSS px per velocity cell
  dyeScale: 1.5, // dye grid is this many times finer than the velocity grid
  followScroll: true, // smoke scrolls with the page instead of sticking to the viewport

  fluidStrength: 1,
  fluidInjection: 12, // 1/s
  fluidRadius: 0.7, // stroke width for velocity (units)
  dyeRadius: 0.55, // stroke width for smoke (units)
  fluidStretch: 0.06, // stroke elongation per unit/s of speed
  fluidTurbulence: 0.25,
  fluidNoiseScale: 0.9, // size of the irregularity injected with each stroke
  fluidAdvection: 1,
  fluidDissipation: 0.9, // velocity decay per second
  dyeDissipation: 0.35, // smoke decay per second (lower = lingers longer)
  dyeAmount: 0.12, // smoke per unit/s of stroke speed (capped at 1)
  dyeRate: 5, // smoke injected per second at that cap
  fluidVelocityDamping: 12, // 1/s
  mouseSmoothing: 20, // 1/s
  maxMouseSpeed: 25, // units/s
  fluidMinSpeed: 0.5, // units/s
  fluidVorticity: 10, // curls in the smoke (higher = more, finer billows)
  fluidPressure: 0.8,
  fluidPressureIterations: 16,

  // HTML text drawn with the same fluid (fluidText.js)
  textDistortion: 0.015, // s: flow (units/s) -> glyph displacement
  textMaxOffset: 18, // CSS px, cap on that displacement
  textChroma: 0.004, // s: flow -> RGB split
  textChromaThreshold: 1.2, // units/s where the RGB split begins
  textGrain: 0.16, // RGB grain strength where the fluid moves
  textGrainSize: 1.5, // device px
  textPadding: 48, // CSS px around the text the distortion may spill into
};
