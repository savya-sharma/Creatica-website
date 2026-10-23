// The blob transition's shaders. One full-screen quad; the fragment shader
// sums a metaball field from up to MAX_POINTS growing blobs (so neighbours
// merge smoothly), with distances distorted by the noise texture so every
// outline is irregular and organic.
//
//   cover  (uInvert 0): alpha = the blobs  - they grow over the page
//   reveal (uInvert 1): alpha = 1 - blobs  - holes grow from fresh points

export const MAX_POINTS = 32;

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  #define MAX_POINTS ${MAX_POINTS}

  uniform vec4 uPoints[MAX_POINTS]; // x (0..aspect), y (0..1, y down), delay, size
  uniform int uCount;
  uniform float uProgress;          // 0..1 through this phase
  uniform float uInvert;            // 0 cover, 1 reveal
  uniform sampler2D uNoise;
  uniform float uNoiseIntensity;
  uniform float uNoiseScale;
  uniform float uBlobScale;
  uniform float uEdgeSoftness;      // feather width, relative to the blob size
  uniform float uMoveSpeed;
  uniform float uNoiseSmoothing;    // mip bias: higher = smoother noise
  uniform float uAspect;            // width / height
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uRimColor;
  varying vec2 vUv;

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 p = uv * vec2(uAspect, 1.0);

    // The (grayscale) texture stretches or shrinks distances in proportion,
    // so outlines are irregular at every size but never break into specks.
    // Reads use a blurrier mip level (uNoiseSmoothing) so the shapes are
    // smooth and continuous rather than grainy. Movement: two copies of the
    // broad field drift apart in different directions and slowly cross-fade,
    // so the edges deform softly in place instead of sliding; uProgress
    // alone drives the transition.
    vec2 nuv = p * uNoiseScale;
    float t = uTime * uMoveSpeed;
    float broadA = texture2D(uNoise, nuv + vec2(t * 0.020, t * 0.006), uNoiseSmoothing).r;
    float broadB = texture2D(uNoise, nuv + vec2(0.43 - t * 0.012, 0.17 + t * 0.016), uNoiseSmoothing).r;
    float broad = mix(broadA, broadB, 0.5 + 0.5 * sin(t * 0.35));
    float detail = texture2D(uNoise, nuv * 1.6 + vec2(0.37, 0.61 - t * 0.015), uNoiseSmoothing).r;
    float n = broad * 0.72 + detail * 0.28;
    float distort = max(1.0 + (n - 0.5) * uNoiseIntensity * 2.5, 0.2);

    // Deep inside the cover no further blob can change the pixel, so the
    // loop stops there. The cut-off sits well past the edge, so the field
    // stays exact across the feathered band (its screen-space slope is
    // used below).
    float full = 3.0;
    float field = 0.0;
    for (int i = 0; i < MAX_POINTS; i++) {
      if (i >= uCount || field >= full) break;
      vec4 pt = uPoints[i]; // xy already in aspect space (controller.js)
      // each blob starts after its own delay and grows to full size;
      // one that has not started adds nothing
      float g = clamp((uProgress - pt.z) / max(1.0 - pt.z, 0.001), 0.0, 1.0);
      if (g <= 0.0) continue;
      g = g * g * (3.0 - 2.0 * g);
      float r = uBlobScale * pt.w * g * (1.0 + 0.9 * g);
      vec2 d = (p - pt.xy) * distort;
      field += (r * r) / (dot(d, d) + 1e-5);
    }

    // Feathered edge: s is the relative distance to the outline (for a lone
    // blob exactly (radius - distance) / radius: 0 on the edge, > 0 inside)
    // - bounded, smooth everywhere and linear across the edge, so the
    // smoothstep gives an even, symmetric soft band. uEdgeSoftness sets its
    // width; fwidth(s) adds at least a pixel of anti-aliasing. Everything
    // away from the edge stays crisp.
    float s = 1.0 - inversesqrt(max(field, 1e-6));
    float feather = uEdgeSoftness + fwidth(s);
    float m = smoothstep(-feather, feather, s);
    // the ends are exact: nothing at 0, the whole screen at 1
    m = mix(m, 1.0, smoothstep(0.93, 1.0, uProgress)) * step(0.0001, uProgress);

    float alpha = mix(m, 1.0 - m, uInvert);
    // a faint lighter band where the cover meets the page
    float rim = clamp(alpha * (1.0 - alpha) * 4.0, 0.0, 1.0);
    vec3 col = mix(uColor, uRimColor, rim * 0.45);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
