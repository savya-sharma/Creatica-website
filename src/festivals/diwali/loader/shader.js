// The Diwali loader's shader (DiwaliIntro.js): a lit diya at the centre of a
// charcoal night, a gold-lined rangoli drawing itself round it as the count
// runs, sparks rising, and - once everything has loaded - the flame flares
// and the dark opens from the centre in a petalled edge rimmed with golden
// light, into the hero.
//
//   uEmerge   0..1  the overlay's plain colour -> the scene (a soft fade-in,
//                   so nothing pops when the canvas takes over)
//   uLoad     0..1  the count: each ring of the rangoli draws itself in,
//                   clockwise from the top, as its share of the count passes;
//                   a gold ring traces the count round the outside
//   uProgress 0..1  the reveal: the flame flares, then the dark opens
//
// Units: 1 = half the shorter side of the screen, so the rangoli keeps its
// proportions on any screen. Colours are the hero's Diwali palette (sRGB,
// written straight out).

export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uLoad;
  uniform float uProgress;
  uniform float uEmerge;
  uniform float uAspect;
  uniform vec3 uBase;
  varying vec2 vUv;

  #define PI 3.14159265
  #define TAU 6.28318531

  const vec3 NIGHT = vec3(0.047, 0.035, 0.028);
  const vec3 WARM = vec3(0.17, 0.095, 0.05);
  const vec3 GOLD = vec3(0.91, 0.78, 0.40);
  const vec3 SAFFRON = vec3(0.957, 0.64, 0.0);
  const vec3 ORANGE = vec3(0.957, 0.48, 0.12);
  const vec3 VERMILION = vec3(0.89, 0.26, 0.20);
  const vec3 TEAL = vec3(0.12, 0.50, 0.51);
  const vec3 TEAL_DEEP = vec3(0.05, 0.30, 0.32);
  const vec3 CHALK = vec3(0.95, 0.92, 0.83);
  const vec3 CLAY = vec3(0.45, 0.18, 0.07);
  const vec3 LAMPLIGHT = vec3(1.0, 0.66, 0.28);

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.5 * noise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 3.1;
    v += 0.25 * noise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 3.1;
    v += 0.125 * noise(p);
    return v / 0.875;
  }

  // an anti-aliased line of half-width w at distance d
  float stroke(float d, float w, float aa) {
    return 1.0 - smoothstep(w, w + aa, abs(d));
  }

  // how much of a ring has drawn in at this clock angle (0 at the top,
  // clockwise): its share of the count, from..to, sweeps it round
  float drawn(float clock, float from, float to) {
    float k = clamp((uLoad - from) / (to - from), 0.0, 1.0) * 1.03;
    return 1.0 - smoothstep(k - 0.02, k, clock);
  }

  // signed arc-distance to n petals between radii r0..r1 (negative inside);
  // pointed 0 = rounded lotus petals, 1 = pointed leaf petals
  float petals(float r, float a, float n, float r0, float r1, float width, float pointed) {
    float t = (r - r0) / (r1 - r0);
    if (t < 0.0 || t > 1.0) return 1.0;
    float th = mod(a + PI / n, TAU / n) - PI / n;
    float profile = mix(pow(sin(PI * t), 0.6), sin(PI * pow(t, 0.7)), pointed);
    return (abs(th) - width * (PI / n) * profile) * r;
  }

  // the angle across the petal sector (0 on a petal's axis)
  float across(float a, float n) {
    return mod(a + PI / n, TAU / n) - PI / n;
  }

  // sparks rising through the dark, two layers at different scales
  float sparks(vec2 p, float t) {
    float s = 0.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float scale = 6.0 + fi * 5.0;
      vec2 g = p * scale - vec2(0.0, t * (0.22 + 0.12 * fi) * scale);
      vec2 id = floor(g);
      float h = hash(id + fi * 17.0);
      if (h > 0.8) {
        vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
        off.x += 0.22 * sin(t * 1.3 + h * 20.0);
        float d = length(fract(g) - 0.5 - off * 0.7);
        float twinkle = 0.45 + 0.55 * sin(t * (3.0 + h * 4.0) + h * 30.0);
        s += exp(-d * d * 160.0) * twinkle * (0.6 + 0.4 * fi);
      }
    }
    return s;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
    float rs = length(uv) / length(vec2(uAspect, 1.0) * 0.5); // 0 centre .. 1 corner
    vec2 p = uv * 2.0 / min(uAspect, 1.0);                    // 1 = half the shorter side
    float t = uTime;

    // the reveal: the flame flares, then the dark opens from the centre
    float flare = smoothstep(0.0, 0.3, uProgress);
    float open = smoothstep(0.14, 1.0, uProgress);
    float sweep = open * 1.3 - 0.06;
    // already open here (the edge's widest reach, its rim included): nothing to draw
    if (uProgress >= 1.0 || rs * 1.08 + 0.03 < sweep - 0.2) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // the rangoli: grows a little as it opens; turns slowly, its outer petals
    // the other way
    vec2 q = p / (0.68 * (1.0 + 0.45 * open));
    float r = length(q);
    float clock = fract(atan(q.x, q.y) / TAU + 1.0); // 0 at the top, clockwise
    float spin = t * 0.035;
    float a = atan(q.y, q.x) + spin;
    float a2 = atan(q.y, q.x) - spin * 1.6;
    float aa = fwidth(r) * 1.2 + 1e-4;
    float lw = 0.0042;

    // the flame's breathing, never a strobe
    float flick = 0.86 + 0.14 * noise(vec2(t * 5.0, 1.7)) + 0.04 * sin(t * 13.0);
    float light = (0.55 + 0.45 * uLoad + 0.9 * flare) * flick;

    // -- the night: charcoal, warmer near the lamp, faint drifting smoke ---
    float rp = length(p);
    vec3 col = mix(NIGHT, WARM, exp(-rp * 1.25));
    col += 0.04 * (fbm(p * 1.3 + vec2(t * 0.03, -t * 0.06)) - 0.5);
    col += LAMPLIGHT * (exp(-rp * 3.4) * 0.32 + exp(-rp * 1.0) * 0.07) * light;

    // the lamp lights the lines: brighter near it, brighter as it flares
    float lit = (0.5 + 0.65 * exp(-r * 1.1)) * (0.75 + 0.25 * light) * (1.0 + 0.7 * flare);
    float ink = 0.0;  // gold line coverage
    float glow = 0.0; // soft light round the main rings

    // -- ring 1: an inner ring and eight teal lotus petals (count 0-30%) ----
    float d1 = drawn(clock, 0.0, 0.3);
    ink += stroke(r - 0.24, lw, aa) * d1;
    float p1 = petals(r, a, 8.0, 0.25, 0.36, 0.86, 0.0);
    float t1 = clamp((r - 0.25) / 0.11, 0.0, 1.0);
    col = mix(col, mix(TEAL, TEAL_DEEP, t1) * lit, smoothstep(aa, -aa, p1) * 0.65 * d1);
    ink += stroke(p1, lw, aa) * d1;

    // -- ring 2: twelve orange lotus petals with veins (count 25-60%) -------
    float d2 = drawn(clock, 0.25, 0.6);
    ink += stroke(r - 0.37, lw, aa) * d2;
    float p2 = petals(r, a, 12.0, 0.38, 0.56, 0.9, 0.0);
    float t2 = clamp((r - 0.38) / 0.18, 0.0, 1.0);
    col = mix(col, mix(SAFFRON, VERMILION, t2) * lit, smoothstep(aa, -aa, p2) * 0.6 * d2);
    ink += stroke(p2, lw, aa) * d2;
    float vein = stroke(across(a, 12.0) * r, lw * 0.7, aa) * step(0.4, r) * step(r, 0.52);
    ink += vein * 0.6 * d2;

    // -- ring 3: a zigzag band and sixteen pointed teal petals with saffron
    //    tips (count 50-85%) -------------------------------------------------
    float d3 = drawn(clock, 0.5, 0.85);
    ink += stroke(r - 0.58, lw, aa) * d3;
    float zig = 0.605 + 0.018 * (abs(fract(a * 24.0 / TAU) * 2.0 - 1.0) * 2.0 - 1.0);
    ink += stroke(r - zig, lw * 0.8, aa) * d3;
    float p3 = petals(r, a2, 16.0, 0.64, 0.88, 0.8, 1.0);
    float t3 = clamp((r - 0.64) / 0.24, 0.0, 1.0);
    col = mix(col, mix(TEAL_DEEP, TEAL, t3) * lit, smoothstep(aa, -aa, p3) * 0.5 * d3);
    ink += stroke(p3, lw, aa) * d3;
    float tip = length(vec2(across(a2, 16.0) * r, r - 0.895)) - 0.011;
    col = mix(col, SAFFRON * lit * 1.1, smoothstep(aa, -aa, tip) * d3);

    // -- ring 4: chalk dots, as if laid in powder (count 75-100%) ----------
    float d4 = drawn(clock, 0.75, 1.0);
    float dot4 = length(vec2(across(a, 48.0) * r, r - 0.92)) - 0.0075;
    col = mix(col, CHALK * lit, smoothstep(aa, -aa, dot4) * d4);

    // -- the count's ring: a faint track, the gold arc of the count over it,
    //    and a bright head where it is drawing --------------------------------
    float R = 0.96;
    ink += stroke(r - R, lw, aa) * 0.16;
    float arc = uLoad >= 0.999 ? 1.0 : 1.0 - smoothstep(uLoad - 0.003, uLoad, clock);
    float arcLine = stroke(r - R, lw * 1.35, aa) * arc;
    ink += arcLine;
    glow += exp(-abs(r - R) / 0.012) * arc * 0.35 + exp(-abs(r - 0.24) / 0.01) * d1 * 0.25;
    vec2 head = vec2(sin(uLoad * TAU), cos(uLoad * TAU)) * R;
    float headOn = step(0.002, uLoad) * (1.0 - step(0.999, uLoad));
    glow += exp(-length(q - head) * 38.0) * 1.4 * headOn;

    col += GOLD * lit * ink + GOLD * glow * (0.6 + 0.4 * light);

    // -- the diya: a clay bowl with a gold rim, and its flame ---------------
    vec2 b = q - vec2(0.0, -0.095);
    float bowl = length(b / vec2(0.16, 0.07)) - 1.0;
    float inBowl = smoothstep(0.03, -0.03, bowl) * smoothstep(0.004, -0.004, b.y);
    vec3 clay = mix(CLAY * 0.45, CLAY * 1.35, smoothstep(-0.07, 0.0, b.y)) * (0.75 + 0.35 * light);
    col = mix(col, clay, inBowl);
    col += GOLD * stroke(b.y, 0.0035, aa) * step(abs(b.x), 0.16) * (0.7 + 0.5 * light);

    // the flame: a teardrop that sways a little more towards its tip
    vec2 fl = (q - vec2(0.0, -0.095)) / (0.2 * (1.0 + 0.25 * flare));
    float y = fl.y;
    fl.x += 0.07 * y * y * (sin(t * 5.3) * 0.6 + (noise(vec2(t * 3.0, 4.0)) - 0.5));
    float hw = 0.3 * sqrt(clamp(y, 0.0, 1.0)) * pow(clamp(1.0 - y, 0.0, 1.0), 0.75) * 1.5;
    float dF = abs(fl.x) - hw;
    float axis = clamp(-dF / max(hw, 1e-3), 0.0, 1.0); // 0 at the edge .. 1 on the axis
    vec3 flame = mix(vec3(0.95, 0.33, 0.07), vec3(1.0, 0.74, 0.24), smoothstep(0.0, 0.5, axis));
    flame = mix(flame, vec3(1.0, 0.97, 0.86), smoothstep(0.5, 1.0, axis) * (1.0 - y * 0.75));
    float inFlame = smoothstep(0.0, 0.025, -dF) * step(0.0, y) * smoothstep(1.0, 0.92, y);
    col = mix(col, flame * (1.05 + 0.25 * flare) * flick, inFlame);
    // its halo, warm in the air round it
    col += LAMPLIGHT * exp(-length(q - vec2(0.0, -0.01)) * 13.0) * 0.6 * light;

    // -- sparks rising, thinning towards the top ----------------------------
    col += LAMPLIGHT * sparks(p, t) * 0.55 * (0.4 + 0.6 * uLoad) * smoothstep(1.05, 0.35, vUv.y);

    // -- the reveal: the dark opens from the centre in a petalled edge, a rim
    //    of golden light running along it ------------------------------------
    float level = rs * (1.0 + 0.07 * cos(16.0 * a2)) + 0.022 * (fbm(uv * 3.0 + t * 0.1) - 0.5);
    float alpha = smoothstep(sweep - 0.028, sweep + 0.028, level);
    col += vec3(1.0, 0.76, 0.36) * exp(-abs(level - sweep) / 0.028) * open * (1.0 - open * 0.55) * 1.3;
    alpha *= 1.0 - smoothstep(0.985, 1.0, uProgress);

    col = mix(uBase, max(col, 0.0), uEmerge);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
