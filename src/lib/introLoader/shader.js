// The intro's shader: fluid marble - dark charcoal regions, flowing silver
// bands of very fine striations, and a few thin amber seams - running behind
// the dial for the whole countdown, then dissolving centre-out into the hero.
//
//   stream  a domain-warped stream function (two warp stages: folds and
//           pinches). Its dense isolines are the striations, so the fine
//           lines always run along the flow, through every bend.
//   mask    a broad warped field: silver where it is high, charcoal where low.
//           Amber seams sit on a narrow band where it crosses its threshold,
//           only where a coverage noise allows.
//   grain   a fine grain fixed to the screen, for an analog finish.
//
//   uEmerge   0..1  plain overlay colour -> the marble (a soft fade-in)
//   uProgress 0..1  the dissolve: the hero shows through, centre first, the
//                   boundary following the same field

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uEmerge;
  uniform float uProgress;
  uniform float uTime;            // seconds since the loader appeared
  uniform float uAspect;          // width / height
  uniform float uPixelRatio;
  uniform vec3 uColor;            // overlay colour it fades in from
  uniform vec3 uDark;             // charcoal / black
  uniform vec3 uSilver;           // silver-grey to off-white
  uniform vec3 uAccent;           // muted amber
  uniform float uDarkness;        // share of the screen that stays dark (0..1)
  uniform float uContrast;        // sharpness of the dark/silver boundaries
  uniform float uScale;           // main flow-field scale (higher = smaller forms)
  uniform float uWarp;            // domain-warp intensity
  uniform float uStriations;      // striation density (lines per unit of the field)
  uniform float uStriationWidth;  // striation line thickness (0..1 of the spacing)
  uniform float uStriationContrast;
  uniform float uFlowSpeed;       // overall speed
  uniform float uDeform;          // large-scale deformation
  uniform float uDetail;          // fine-detail intensity (spacing/brightness variation)
  uniform float uAccentIntensity;
  uniform float uAccentCoverage;  // share of the boundaries that get a seam (0..1)
  uniform float uAccentWidth;     // seam width, in field units
  uniform float uGrain;           // grain intensity
  uniform float uGrainScale;      // grain size, in CSS pixels
  uniform float uRevealSoftness;  // dissolve edge softness, in field units
  uniform float uSeed;
  varying vec2 vUv;

  // 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT), -1..1
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  const mat2 OCT = mat2(0.8, 0.6, -0.6, 0.8);
  float fbm2(vec2 p) { return snoise(p) * 0.66 + snoise(OCT * p * 2.03 + 3.7) * 0.34; }
  float fbm3(vec2 p) {
    float s = 0.5 * snoise(p);
    p = OCT * p * 2.03;
    s += 0.25 * snoise(p);
    p = OCT * p * 2.03;
    s += 0.125 * snoise(p);
    return s / 0.875;
  }

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);

    // dissolve sweep (see the end); the field term of its level is at most
    // 0.4, so where even its maximum is behind the sweep the pixel is
    // already fully revealed - skip all the noise. (Neighbours that do run on
    // take no derivative that matters here: their alpha is 0 too.)
    float r = length(uv) / length(vec2(uAspect, 1.0) * 0.5);
    float s = uRevealSoftness;
    float sweep = uProgress * (1.0 + 2.0 * s) - s;
    if (uProgress >= 1.0 || r * 0.6 + 0.4 < sweep - s - 0.01) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec2 p = uv * uScale + vec2(uSeed * 1.37, uSeed * 2.71);
    float t = uTime * uFlowSpeed;

    // two warp stages, each evolving along its own path: folds and pinches
    // that stretch and compress over time rather than sliding as one image
    vec2 q = vec2(fbm2(p + vec2(0.0, t * 0.5)), fbm2(p + vec2(5.2, 1.3) - vec2(t * 0.4, 0.0)));
    vec2 w = vec2(fbm2(p + uWarp * q + vec2(1.7, 9.2) + vec2(t, -t * 0.6) * uDeform * 0.3),
                  fbm2(p + uWarp * q + vec2(8.3, 2.8) + vec2(-t * 0.5, t) * uDeform * 0.25));
    vec2 wp = p + uWarp * w;

    // the stream function: its isolines are the flow lines. A dominant
    // directional component (the marble technique) makes them long strands
    // that the warp folds and pinches, rather than closed loops
    float psi = dot(wp, vec2(0.28, 0.96)) * 0.75 + fbm2(wp * 0.8) * 0.25;

    // silver / dark: a broad field over the same warp
    float mf = 0.5 + 0.5 * fbm2(wp * 0.55 + q * 0.6 + vec2(3.3, 7.1));
    float k = 0.06 + 0.25 * (1.0 - uContrast);
    float bright = smoothstep(uDarkness - k, uDarkness + k, mf);

    // striations: dense isolines of psi, their spacing and strength varied
    // by a slow noise so they never read as a regular grid
    float vary = snoise(wp * 1.7 + 11.0);
    float v = psi * uStriations * (1.0 + 0.18 * uDetail * vary);
    float dv = fwidth(v);
    float d = abs(fract(v) - 0.5) * 2.0;                // 0 between lines .. 1 on a line
    float wdt = clamp(uStriationWidth + 0.1 * uDetail * vary, 0.05, 0.95);
    float stria = smoothstep(1.0 - wdt - dv, 1.0 - wdt + dv, d);
    // fade where the lines would crowd below a pixel (no shimmer, just tone)
    stria = mix(stria, wdt, smoothstep(0.35, 0.7, dv));
    float strand = 0.65 + 0.35 * snoise(vec2(psi * 40.0, 0.0) + wp * 0.4) * uDetail;

    // tone: charcoal lows; silver bands built from the striations
    float core = smoothstep(uDarkness, uDarkness + 0.35, mf);           // brighter toward a band's core
    float shade = bright * mix(1.0 - uStriationContrast, 1.0, stria) * strand * (0.72 + 0.4 * core);
    shade += (1.0 - bright) * stria * 0.06 * uStriationContrast; // faint lines in the dark
    vec3 col = mix(uDark, uSilver, clamp(shade, 0.0, 1.0));

    // amber seams: a thin band where the silver/dark field crosses its
    // threshold, only on some stretches of it
    // thin where the field is steep, a touch wider where it is flat - irregular
    float seamOff = mf - (uDarkness - k * 0.6);
    float fw = fwidth(mf);
    float seam = 1.0 - smoothstep(uAccentWidth, uAccentWidth + fw, abs(seamOff));
    // the two seam noises only where there is a seam (a thin band)
    if (seam > 0.0) {
      float cover = smoothstep(1.0 - uAccentCoverage, 1.0 - uAccentCoverage + 0.12, 0.5 + 0.5 * snoise(wp * 0.7 + 21.0));
      float jag = 0.6 + 0.4 * snoise(wp * 9.0 + t);
      col = mix(col, uAccent, clamp(seam * cover * jag * uAccentIntensity, 0.0, 1.0));
    }

    // grain: fine and fixed to the screen, like paper - texture, never static
    vec2 gp = gl_FragCoord.xy / (uGrainScale * uPixelRatio);
    float grain = hash(floor(gp)) - 0.5;
    col += grain * uGrain * (0.5 + 0.5 * shade);

    col = mix(uColor, clamp(col, 0.0, 1.0), uEmerge);

    // dissolve: centre first, the boundary following the same field
    float level = r * 0.6 + clamp(mf, 0.0, 1.0) * 0.4; // mf is bounded, psi is not
    float alpha = smoothstep(sweep - s, sweep + s, level);
    alpha = mix(1.0, alpha, smoothstep(0.0, 0.01, uProgress)) * (1.0 - smoothstep(0.985, 1.0, uProgress));

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
