// One ShaderMaterial per pool slot (each needs its own texture + uniforms),
// but they all share this source, so three.js compiles a single program.
//
// Curve bending: each plane is not a flat card but a strip of the formation
// curve itself. Every vertex is placed at its own arc position on the curve
// (same profile maths as formation.js), then expressed in the plane's local
// frame so the mesh transform - which the CPU damps towards its target -
// carries it into place. Neighbouring planes therefore share one continuous
// curve, and the top/bottom edges become smooth waves instead of straight
// segments with a kink at every plane.
//
// Fluid: the shared field (fluid.js) deforms the mesh itself - vertices are
// pushed along the flow and dented back into depth, so the plane's surface
// and outline really move. The fragment shader adds only fine detail on top
// (a small extra warp, smear and RGB split). Both read the field pre-smoothed
// (fluid.js blurs it once per step), so its grid never shows as grain.

export const capLengthChunk = /* glsl */ `
  vec2 capLength(vec2 v, float maxLength) {
    float l = length(v);
    return l > maxLength ? v * (maxLength / l) : v;
  }
`;

const flowChunk = /* glsl */ `
  uniform sampler2D uFluid;      // velocity field, pre-smoothed (world units/s)
  uniform float uFluidActive;
  uniform vec4 uFluidDomain;     // xy = field min corner (arc, y), zw = size

  vec2 readFlow(vec2 fieldUv) {
    return texture2D(uFluid, fieldUv).xy;
  }
  ${capLengthChunk}
`;

// Curve bending, shared by the image planes and their captions.
const curveChunk = /* glsl */ `
  uniform float uCurveBend;   // 0 = flat planes, 1 = follow the curve exactly
  uniform int uCurveType;     // 0 = bump, 1 = cylinder
  uniform float uCurveDepth;  // bump depth
  uniform float uCurveWidth;  // bump width
  uniform float uCurveRadius; // cylinder radius
  uniform float uCenterX;     // curve x at the plane centre
  uniform vec2 uCenterPoint;  // curve (x, z) at the plane centre
  uniform float uArcCenter;   // arc length at the plane centre
  uniform float uFrameAngle;  // the plane's rotation.y (its local frame)
  uniform vec2 uPlaneSize;    // world width/height of the plane (incl. scale)
  uniform float uLift;        // verticalLift * planeHeight
  uniform float uLiftDepth;
  uniform float uPlaneY;      // the plane centre's height

  float bumpZ(float x) {
    return -uCurveDepth * (1.0 - exp(-x * x / (2.0 * uCurveWidth * uCurveWidth)));
  }

  float bumpSpeed(float x) {
    // ds/dx = sqrt(1 + z'(x)^2)
    float w2 = uCurveWidth * uCurveWidth;
    float slope = -uCurveDepth * x / w2 * exp(-x * x / (2.0 * w2));
    return sqrt(1.0 + slope * slope);
  }

  // Point on the curve at arc offset ds from the plane centre (x, z).
  vec2 curvePoint(float ds) {
    if (uCurveType == 1) {
      float a = (uArcCenter + ds) / uCurveRadius;
      return vec2(uCurveRadius * sin(a), uCurveRadius * (cos(a) - 1.0));
    }
    // Invert arc length -> x: a few fixed-point steps with Simpson's rule
    // for the mean speed. Converges well within a plane's width.
    float x = uCenterX + ds;
    float centreSpeed = bumpSpeed(uCenterX);
    for (int i = 0; i < 4; i++) {
      float speed = (centreSpeed + 4.0 * bumpSpeed(0.5 * (uCenterX + x)) + bumpSpeed(x)) / 6.0;
      x = uCenterX + ds / speed;
    }
    return vec2(x, bumpZ(x));
  }

  float liftAt(float z) {
    return uLift * min(1.0, -z / uLiftDepth);
  }
`;

// RGB film grain (needs uTime declared before it).
export const grainChunk = /* glsl */ `
  uniform float uGrain;          // RGB grain strength at full flow
  uniform float uGrainSize;      // grain size in screen pixels
  uniform float uGrainFlow;      // flow speed at which the grain is fully visible
  uniform float uGrainFps;       // how often the grain pattern changes

  float grainHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Film-like RGB grain: an independent value per colour channel, sized in
  // screen pixels (same on near and far planes) and refreshed at a film rate.
  vec3 rgbGrain() {
    vec2 cell = floor(gl_FragCoord.xy / uGrainSize);
    float frame = floor(uTime * uGrainFps);
    vec2 seed = cell + frame * vec2(17.31, 41.77);
    return vec3(
      grainHash(seed),
      grainHash(seed + vec2(113.5, 271.9)),
      grainHash(seed + vec2(269.3, 183.1))
    ) - 0.5;
  }
`;

export const vertexShader = /* glsl */ `
  uniform float uTime;
  ${curveChunk}
  uniform float uVertexDisplace; // seconds: flow -> in-plane vertex push
  uniform float uVertexDepth;   // seconds: flow speed -> dent into depth
  uniform float uMaxVertex;     // world units, cap on the vertex push
  ${flowChunk}

  varying vec2 vUv;
  varying vec2 vRibbon;       // ribbon-space coordinate (arc, y) for the fluid field

  void main() {
    vUv = uv;
    vec3 pos = position;
    // where this vertex sits on the ribbon, independent of rotation/bending:
    // the shared fluid field is stored in this space
    vRibbon = vec2(uArcCenter + position.x * uPlaneSize.x, uPlaneY + position.y * uPlaneSize.y);

    // --- curve bending --------------------------------------------------------
    vec2 c = uCenterPoint;
    vec2 p = curvePoint(position.x * uPlaneSize.x);
    vec2 rel = p - c;
    float cs = cos(uFrameAngle);
    float sn = sin(uFrameAngle);
    // world offset -> plane-local (inverse of the Y rotation), then undo the
    // mesh scale, which the model matrix re-applies
    vec3 bent = vec3(
      (rel.x * cs - rel.y * sn) / uPlaneSize.x,
      position.y + (liftAt(p.y) - liftAt(c.y)) / uPlaneSize.y,
      rel.x * sn + rel.y * cs
    );
    pos = mix(pos, bent, uCurveBend);
    // -------------------------------------------------------------------------

    // --- fluid deformation of the mesh ----------------------------------------
    // The field's x runs along the ribbon = the plane's local x, its y is the
    // plane's local y, so the flow maps straight onto the surface. Vertices
    // move downstream (the image and its outline are dragged with the stroke)
    // and dent away from the viewer where the liquid moves fastest.
    if (uFluidActive > 0.5) {
      vec2 flow = readFlow((vRibbon - uFluidDomain.xy) / uFluidDomain.zw);
      vec2 push = capLength(flow * uVertexDisplace, uMaxVertex);
      pos.x += push.x / uPlaneSize.x;
      pos.y += push.y / uPlaneSize.y;
      pos.z -= min(length(flow) * uVertexDepth, uMaxVertex);
    }
    // -------------------------------------------------------------------------

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uReveal;
  uniform vec2 uCoverScale;
  uniform vec3 uPlaceholder;
  uniform vec3 uFadeColor;
  uniform float uFade;
  uniform vec3 uBorderColor;
  uniform float uBorderAlpha;
  uniform float uBorderPx;
  uniform float uTime;

  // shared fluid field (fluid.js), ribbon space, world units per second
  ${flowChunk}
  uniform vec2 uPlaneSize;       // world size of this plane: world -> plane UV
  uniform float uDistortion;     // seconds: flow velocity -> displacement
  uniform float uSmear;          // seconds: flow velocity -> smear length
  uniform float uChroma;         // seconds: flow velocity -> RGB split
  uniform float uChromaThreshold;// flow speed where the RGB split starts
  uniform float uMaxDistortion;  // world units, hard cap on any offset
  ${grainChunk}

  varying vec2 vUv;
  varying vec2 vRibbon;

  // object-fit: cover (uCoverScale from the CPU), edge-safe: displaced UVs
  // clamp to the portrait instead of wrapping, mirroring or leaving gaps
  vec3 sampleImage(vec2 uv) {
    uv = clamp(uv, 0.002, 0.998);
    return texture2D(uMap, (uv - 0.5) * uCoverScale + 0.5).rgb;
  }

  // One tap of the smear with velocity-dependent RGB separation.
  vec3 tap(vec2 uv, vec2 split) {
    return vec3(sampleImage(uv + split).r, sampleImage(uv).g, sampleImage(uv - split).b);
  }

  void main() {
    vec3 image;
    vec2 fieldUv = (vRibbon - uFluidDomain.xy) / uFluidDomain.zw;
    vec2 flow = uFluidActive > 0.5 ? readFlow(fieldUv) : vec2(0.0);
    float speed = length(flow);

    if (speed > 0.03) {
      vec2 toUv = 1.0 / uPlaneSize;

      // The mesh already carries the large-scale drag (vertex shader); this
      // adds finer warping between vertices. Sample upstream along the flow.
      vec2 drag = flow * uDistortion;
      // Fine scale: the field again, read at the upstream point. Where the
      // flow curls or shears this disagrees with the first read, which folds
      // and breaks up the image organically instead of shifting it rigidly.
      vec2 flow2 = readFlow(fieldUv - drag / uFluidDomain.zw);
      vec2 displacement = capLength(drag * 0.55 + flow2 * uDistortion * 0.65, uMaxDistortion);
      vec2 uv = vUv - displacement * toUv;

      // Directional smear along the local flow (not the raw mouse), trailing
      // upstream so pixels streak behind the motion like dragged liquid.
      vec2 streak = capLength(flow2 * uSmear, uMaxDistortion) * toUv;
      float splitAmount = smoothstep(uChromaThreshold, uChromaThreshold * 3.0, speed);
      vec2 split = capLength(flow2 * uChroma, uMaxDistortion * 0.35) * toUv * splitAmount;

      if (splitAmount > 0.0) {
        image = tap(uv, split * 1.0) * 0.34
              + tap(uv - streak * 0.35, split * 1.3) * 0.24
              + tap(uv - streak * 0.7, split * 1.6) * 0.16
              + tap(uv - streak * 1.0, split * 1.9) * 0.1
              + tap(uv + streak * 0.3, split * 0.7) * 0.16;
      } else {
        image = sampleImage(uv) * 0.34
              + sampleImage(uv - streak * 0.35) * 0.24
              + sampleImage(uv - streak * 0.7) * 0.16
              + sampleImage(uv - streak) * 0.1
              + sampleImage(uv + streak * 0.3) * 0.16;
      }

      // subtle lift where the liquid moves fastest
      image *= 1.0 + 0.035 * smoothstep(0.5, 4.0, speed);

      // RGB grain where the liquid is moving; it fades out with the flow
      image += rgbGrain() * uGrain * smoothstep(0.03, uGrainFlow, speed);
      image = clamp(image, 0.0, 1.0);
    } else {
      image = sampleImage(vUv);
    }

    vec3 color = mix(uPlaceholder, image, uHasMap * uReveal);

    // Depth fade: planes dissolve into the section background as they recede.
    color = mix(color, uFadeColor, uFade);

    // Hairline border measured in screen pixels, so it stays the same
    // thickness on every plane regardless of distance or angle.
    vec2 edge = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(1e-5));
    float d = min(edge.x, edge.y);
    float border = 1.0 - smoothstep(uBorderPx - 0.5, uBorderPx + 0.5, d);
    color = mix(color, uBorderColor, border * uBorderAlpha * (1.0 - uFade * 0.6));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Captions (name + role under each plane): a strip of the same ribbon below
// the plane's bottom-left corner, bent with the same curve maths and moved by
// the plane's transform, textured with canvas-drawn text (captions.js). The
// shared fluid field displaces the glyphs, splits the colour channels and
// adds RGB grain where it moves - the same treatment as the HTML text.

export const captionVertexShader = /* glsl */ `
  uniform float uTime;
  ${curveChunk}
  uniform vec4 uCapRect;      // caption rect in the plane's local frame (world): x0, y0 (bottom-left), w, h

  varying vec2 vUv;
  varying vec2 vRibbon;

  void main() {
    vUv = uv;
    vec2 local = uCapRect.xy + uv * uCapRect.zw;
    vRibbon = vec2(uArcCenter + local.x, uPlaneY + local.y);

    vec2 c = uCenterPoint;
    vec2 p = curvePoint(local.x);
    vec2 rel = p - c;
    float cs = cos(uFrameAngle);
    float sn = sin(uFrameAngle);
    vec3 bent = vec3(rel.x * cs - rel.y * sn, local.y + liftAt(p.y) - liftAt(c.y), rel.x * sn + rel.y * cs);
    vec3 pos = mix(vec3(local, 0.0), bent, uCurveBend);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const captionFragmentShader = /* glsl */ `
  uniform sampler2D uText;        // white text, coverage in alpha
  uniform vec3 uTextColor;        // sRGB
  uniform float uOpacity;
  uniform float uTime;
  uniform vec4 uCapRect;
  ${flowChunk}
  uniform float uChromaThreshold;
  uniform float uTextDistortion;  // seconds: flow -> glyph displacement
  uniform float uTextChroma;      // seconds: flow -> RGB split
  uniform float uMaxTextOffset;   // world units
  uniform float uTextGrain;       // caption grain strength
  ${grainChunk}

  varying vec2 vUv;
  varying vec2 vRibbon;

  float coverage(vec2 uv) {
    return texture2D(uText, clamp(uv, 0.0, 1.0)).a;
  }

  void main() {
    vec2 flow = uFluidActive > 0.5 ? readFlow((vRibbon - uFluidDomain.xy) / uFluidDomain.zw) : vec2(0.0);
    float speed = length(flow);
    vec2 offset = capLength(flow * uTextDistortion, uMaxTextOffset) / uCapRect.zw;
    vec2 uv = vUv - offset;
    float splitOn = smoothstep(uChromaThreshold, uChromaThreshold * 3.0, speed);
    vec2 split = capLength(flow * uTextChroma, uMaxTextOffset * 0.5) / uCapRect.zw * splitOn;

    vec3 rgb = vec3(coverage(uv + split), coverage(uv), coverage(uv - split));
    float a = max(rgb.r, max(rgb.g, rgb.b));
    vec3 color = uTextColor * rgb;
    color += rgbGrain() * uTextGrain * smoothstep(0.03, uGrainFlow, speed) * a;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * uOpacity, a * uOpacity); // premultiplied
  }
`;
