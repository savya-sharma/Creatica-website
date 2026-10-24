// The page transition's shader. One full-screen quad: an organic opening
// centred on the screen whose radius is driven by the transition. The
// distance from the centre is distorted by the noise texture, so the
// boundary is irregular and drifts softly.
//
//   cover  (uInvert 0): the opening shrinks from past the corners to
//                       nothing - the cover closes in from the borders
//   reveal (uInvert 1): the opening grows from the centre back past the
//                       corners - the cover recedes to the borders
//
// The edge is soft (uEdgeSoftness) and carries a fine grain that is
// strongest right at the boundary and fades with distance from it, so the
// cover's interior and the open page stay clean.

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uProgress;          // 0..1 through this phase
  uniform float uInvert;            // 0 cover, 1 reveal
  uniform sampler2D uNoise;
  uniform float uNoiseIntensity;
  uniform float uNoiseScale;
  uniform float uEdgeSoftness;      // feather width, in screen heights
  uniform float uMoveSpeed;
  uniform float uNoiseSmoothing;    // mip bias: higher = smoother noise
  uniform float uAspect;            // width / height
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uColor2;            // the second background tone
  uniform float uTwoTone;           // how far the cover blends into uColor2 (0..1)
  uniform vec3 uRimColor;
  uniform float uGrain;             // grain strength at the edge (0 = none)
  uniform float uGrainScale;        // grain size, in CSS pixels
  uniform float uGrainSpeed;        // how fast the grain drifts (0 = still)
  uniform float uGrainWidth;        // how far from the edge it reaches, in screen heights
  uniform float uPixelRatio;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // fine value noise: soft-edged specks, never single hard pixels
  float grainNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    // centred, in screen heights
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);

    // The (grayscale) texture stretches or shrinks the distance in
    // proportion, so the outline is irregular at every size. Reads use a
    // blurrier mip level (uNoiseSmoothing) so it is smooth rather than
    // grainy. Movement: two copies of the broad field drift apart in
    // different directions and slowly cross-fade, so the edge deforms softly
    // in place instead of sliding; uProgress alone drives the transition.
    vec2 nuv = p * uNoiseScale;
    float t = uTime * uMoveSpeed;
    float broadA = texture2D(uNoise, nuv + vec2(t * 0.020, t * 0.006), uNoiseSmoothing).r;
    float broadB = texture2D(uNoise, nuv + vec2(0.43 - t * 0.012, 0.17 + t * 0.016), uNoiseSmoothing).r;
    float broad = mix(broadA, broadB, 0.5 + 0.5 * sin(t * 0.35));
    float detail = texture2D(uNoise, nuv * 1.6 + vec2(0.37, 0.61 - t * 0.015), uNoiseSmoothing).r;
    float n = broad * 0.72 + detail * 0.28;
    float spread = uNoiseIntensity * 1.25;
    float rr = r * max(1.0 + (n - 0.5) * 2.0 * spread, 0.2);

    // how much of the screen is covered: 0 none .. 1 all, in either phase
    float c = mix(uProgress, 1.0 - uProgress, uInvert);

    // the opening's radius: about the farthest corner when uncovered (so the
    // borders start filling at once), nothing when covered
    float feather = uEdgeSoftness + fwidth(rr);
    float corner = length(vec2(uAspect, 1.0) * 0.5);
    float reach = corner * (1.0 + spread * 0.5) + uEdgeSoftness * 2.0;
    float radius = (1.0 - c) * reach;

    float alpha = smoothstep(radius - feather, radius + feather, rr);

    // grain along the boundary: fades with distance from the edge (the same
    // field that draws it), so it follows the contour as it moves. It
    // drifts slowly rather than re-rolling each frame, so nothing flickers.
    float band = exp(-pow((rr - radius) / max(uGrainWidth, 1e-4), 2.0));
    vec2 gp = gl_FragCoord.xy / (uGrainScale * uPixelRatio) + vec2(uTime * uGrainSpeed, -uTime * uGrainSpeed * 0.7);
    alpha = clamp(alpha + (grainNoise(gp) - 0.5) * 2.0 * uGrain * band, 0.0, 1.0);

    // the ends are exact: nothing at 0 (the farthest corner bits fade in
    // rather than pop), the whole screen at 1
    alpha = mix(alpha, 1.0, smoothstep(0.96, 1.0, c)) * smoothstep(0.0, 0.06, c);

    // a faint band where the cover meets the page
    float rim = clamp(alpha * (1.0 - alpha) * 4.0, 0.0, 1.0);
    // two-tone cover: broad, soft, non-repeating areas of each colour (a
    // smooth procedural noise - the texture's mirrored tiling would show),
    // drifting slowly
    vec2 tp = p * 1.4 + vec2(t * 0.05, -t * 0.035);
    float tone = grainNoise(tp) * 0.65 + grainNoise(tp * 2.3 + 7.1) * 0.35;
    vec3 base = mix(uColor, uColor2, smoothstep(0.35, 0.75, tone) * uTwoTone);
    vec3 col = mix(base, uRimColor, rim * 0.45);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
