// The single source of truth for where a plane belongs. Everything visual
// (x, y, z, rotation, scale, fade) is derived from one continuous logical
// position, so the formation can never disagree with itself.
//
// Planes travel along a curve seen from above (x across the screen, z towards
// the camera). Two profiles are supported:
//
//   "bump" (default)  z(x) = -depth * (1 - exp(-x^2 / (2 * width^2)))
//       A forward bulge in the centre that settles into a deeper, flatter
//       back section. The tangent angle rises to a peak about one `width`
//       from the centre and eases off again, so the outermost planes are
//       smaller (deeper) but turned only moderately, and run off the frame
//       edge at a readable size. Measured against the reference image this
//       fits ~3x better than a circle, including both ends.
//
//   "cylinder"        x = r sin(theta), z = r (cos(theta) - 1)
//       A true circular arc. The tangent angle keeps growing, so outer planes
//       go towards edge-on.
//
// Planes are spaced by arc length (`pitch`) along the curve, so the gaps stay
// even where it turns, and every plane is oriented along the curve's tangent.

import { smoothstep } from "./math.js";

const SAMPLES = 2048;
const MAX_ARC = 60;

/** Arc-length lookup table for the bump profile. */
class BumpProfile {
  constructor(depth, width) {
    this.depth = depth;
    this.width = width;
    this.xs = new Float32Array(SAMPLES + 1);
    this.ss = new Float32Array(SAMPLES + 1);
    // s >= x everywhere, so sampling x up to MAX_ARC covers MAX_ARC of arc.
    const dx = MAX_ARC / SAMPLES;
    let s = 0;
    let prevZ = 0;
    for (let i = 1; i <= SAMPLES; i++) {
      const x = i * dx;
      const z = this.z(x);
      s += Math.hypot(dx, z - prevZ);
      prevZ = z;
      this.xs[i] = x;
      this.ss[i] = s;
    }
  }

  z(x) {
    return -this.depth * (1 - Math.exp((-x * x) / (2 * this.width * this.width)));
  }

  /** dz/dx */
  slope(x) {
    const w2 = this.width * this.width;
    return ((-this.depth * x) / w2) * Math.exp((-x * x) / (2 * w2));
  }

  /** x (>= 0) at arc length s (>= 0) from the centre. */
  xAtArc(s) {
    const { ss, xs } = this;
    if (s >= ss[SAMPLES]) return xs[SAMPLES] + (s - ss[SAMPLES]);
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ss[mid] < s) lo = mid;
      else hi = mid;
    }
    return xs[lo] + ((xs[hi] - xs[lo]) * (s - ss[lo])) / (ss[hi] - ss[lo] || 1);
  }

  /** Point + tangent angle at signed arc length, written into out. */
  sample(arc, out) {
    const side = arc < 0 ? -1 : 1;
    const x = this.xAtArc(Math.abs(arc));
    out.x = side * x;
    out.z = this.z(x);
    out.theta = side * Math.atan(-this.slope(x));
    return out;
  }

  /** Surface depth at signed x. */
  zAtX(x) {
    return this.z(Math.abs(x));
  }

  /** Signed arc length at signed x (inverse of sample). xs is uniform. */
  arcAtX(x) {
    const ax = Math.abs(x);
    const f = (ax / MAX_ARC) * SAMPLES;
    if (f >= SAMPLES) return Math.sign(x) * (this.ss[SAMPLES] + (ax - MAX_ARC));
    const i = Math.floor(f);
    return Math.sign(x) * (this.ss[i] + (this.ss[i + 1] - this.ss[i]) * (f - i));
  }

  maxDepth() {
    return this.depth;
  }
}

class CylinderProfile {
  constructor(radius) {
    this.radius = radius;
  }

  sample(arc, out) {
    const theta = arc / this.radius;
    out.x = this.radius * Math.sin(theta);
    out.z = this.radius * (Math.cos(theta) - 1);
    out.theta = theta;
    return out;
  }

  zAtX(x) {
    const r = this.radius;
    return Math.abs(x) >= r ? -r : Math.sqrt(r * r - x * x) - r;
  }

  arcAtX(x) {
    return this.radius * Math.asin(Math.max(-1, Math.min(1, x / this.radius)));
  }

  maxDepth() {
    return this.radius;
  }
}

/**
 * Where a camera ray meets the ribbon surface (the curve extruded vertically).
 * Writes the hit as ribbon coordinates { arc, y } into `out` and returns true,
 * or returns false if the ray misses. Bisection on depth: the ray starts in
 * front of the curve and ends behind its deepest point.
 */
export function intersectRibbon(layout, origin, direction, out) {
  if (direction.z >= -1e-6) return false;
  const curve = layout.curve;
  const gap = (t) => origin.z + t * direction.z - curve.zAtX(origin.x + t * direction.x);
  let t0 = (0.05 - origin.z) / direction.z;
  let t1 = (-(curve.maxDepth() + 0.5) - origin.z) / direction.z;
  if (gap(t0) < 0 || gap(t1) > 0) return false;
  for (let i = 0; i < 24; i++) {
    const tm = 0.5 * (t0 + t1);
    if (gap(tm) > 0) t0 = tm;
    else t1 = tm;
  }
  const t = 0.5 * (t0 + t1);
  out.arc = curve.arcAtX(origin.x + t * direction.x);
  out.y = origin.y + t * direction.y;
  return true;
}

/** Merge the breakpoint override for this width and build the curve. */
export function resolveLayout(config, viewportWidth) {
  const override = config.responsive.find((r) => viewportWidth <= r.maxWidth) ?? {};
  const layout = { ...config, ...override };
  layout.pitch = layout.planeWidth * (1 + layout.gap);
  layout.curve =
    layout.profile === "cylinder"
      ? new CylinderProfile(layout.radius)
      : new BumpProfile(layout.bumpDepth, layout.bumpWidth);
  // Depth the vertical lift is measured against: the bump's full depth, or
  // for a cylinder its depth at 90deg.
  layout.liftDepth = layout.profile === "cylinder" ? layout.radius : layout.bumpDepth;
  // Filled in by the carousel once the camera is fitted: logical distance
  // (in planes) from the centre to the frame edge, i.e. where |t| = 1.
  layout.curveHalfWidth = 3;
  return layout;
}

/**
 * Target transform for a plane at `logical` (planes from the screen centre,
 * negative = left). Writes into `out` to stay allocation-free.
 *
 * Everything comes from the one curve parameter (arc length = logical *
 * pitch): position on the curve, rotation = the curve's tangent, a subtle
 * lift proportional to depth, and t = the normalised distance to the frame
 * edge for scale/fade. t is not clamped - past the frame the curve simply
 * continues and planes are hidden.
 */
export function getPlaneTargetTransform(logical, layout, out) {
  layout.curve.sample(logical * layout.pitch, out);
  const t = logical / layout.curveHalfWidth;
  out.t = t;
  out.rotationY = out.theta * layout.rotationFactor;
  out.y = layout.verticalLift * layout.planeHeight * Math.min(1, -out.z / layout.liftDepth);
  out.scale = 1 - layout.scaleFalloff * smoothstep(0, 1, Math.abs(t));
  return out;
}

/** Edge-fade amount (0..1) for a normalised position t. */
export function edgeFadeAt(t, layout) {
  return smoothstep(0.85, 1.35, Math.abs(t)) * layout.edgeFade;
}

/**
 * Camera distance and vertical FOV for a stage aspect. The composition is
 * defined horizontally - `frameHalfWidth` world units are visible either side
 * of the centre at z = 0 - so a wider or taller stage changes the FOV, not
 * how many planes are on screen.
 */
export function fitCamera(layout, aspect) {
  const distance = layout.cameraZ;
  let fov = layout.cameraFov;
  if (fov === "auto") {
    fov = (2 * Math.atan(layout.frameHalfWidth / (distance * aspect)) * 180) / Math.PI;
    fov = Math.min(60, Math.max(12, fov));
  }
  return { distance, fov };
}

/**
 * Logical distance at which a plane's inner edge leaves the frame (or it has
 * turned past edge-on). Also used as the |t| = 1 normalisation.
 */
export function measureFrameEdge(layout, cameraDistance, fov, aspect) {
  const frameSlope = Math.tan((fov * Math.PI) / 360) * aspect;
  const halfW = layout.planeWidth / 2;
  const p = { x: 0, z: 0, theta: 0 };
  let innerAtCentreLeft = -1;
  for (let u = 0; u <= MAX_ARC / layout.pitch; u += 0.01) {
    layout.curve.sample(u * layout.pitch, p);
    const rot = p.theta * layout.rotationFactor;
    // the plane centre reaching the frame edge defines t = 1
    if (innerAtCentreLeft < 0 && p.x / (cameraDistance - p.z) > frameSlope) innerAtCentreLeft = u;
    const ex = p.x - halfW * Math.cos(rot);
    const ez = p.z + halfW * Math.sin(rot);
    const leftFrame = ex / (cameraDistance - ez) > frameSlope * 1.02; // small safety margin
    const backFacing = Math.sin(rot) * -p.x + Math.cos(rot) * (cameraDistance - p.z) <= 0;
    if (leftFrame || backFacing) {
      return { centreAtEdge: innerAtCentreLeft > 0 ? innerAtCentreLeft : u, hideBeyond: u };
    }
  }
  const max = MAX_ARC / layout.pitch;
  return { centreAtEdge: innerAtCentreLeft > 0 ? innerAtCentreLeft : max, hideBeyond: max };
}
