import gsap from "gsap";

// The light of the hero's hanging lanterns spilling into the air round them:
// one small WebGL canvas around the lanterns (not a page-wide pass), drawn
// on the site's existing frame loop (gsap.ticker) at half resolution - the
// light is soft, so nothing is lost. Light only: it adds warmth to the page,
// never darkens it.
//
// Fragment shader: round each lantern's light - at the centre of its glass,
// read from the DOM every frame so it follows the sway - a small warm-white
// core, a softer amber halo and a broad, very faint warm diffusion, all
// gaussian/exponential falloffs (no hard edge). A slow value-noise fbm
// stirs the diffusion a little so it reads as light in air, not a perfect
// disc. The glow inside the glass is a CSS layer over the art (diwali.css);
// both breathe with a gentle flame flicker.
//
// Returns null when WebGL is unavailable: the canvas is then marked
// data-fallback and CSS draws a still, soft warm gradient in its place.

const RESOLUTION = 0.5; // of the device pixels

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision mediump float;
uniform float uTime;
uniform vec2 uLight0;   // light centres, canvas px (y up)
uniform vec2 uLight1;
uniform float uGlow0;   // their intensities (flicker)
uniform float uGlow1;
uniform float uSize;    // the large lantern's height, canvas px

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
  float v = 0.0;
  float a = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = turn * p * 2.03 + 3.1;
    a *= 0.5;
  }
  return v;
}

// one lantern's light at squared distance r (in lantern heights)
float glow(float r, float air) {
  float core = 0.55 * exp(-r * 60.0);   // warm-white, close round the glass
  float halo = 0.3 * exp(-r * 14.0);    // the softer amber halo
  float diffuse = 0.16 * exp(-sqrt(r) * 3.6) * air; // faint warmth in the air
  return core + halo + diffuse;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  // the air the light passes through, drifting slowly upward
  float air = mix(0.65, 1.25, fbm(px / uSize * 2.0 + vec2(uTime * 0.02, -uTime * 0.05)));

  vec2 d0 = (px - uLight0) / uSize;
  vec2 d1 = (px - uLight1) / uSize;
  float r0 = dot(d0, d0);
  float r1 = dot(d1, d1);
  float core = uGlow0 * 0.55 * exp(-r0 * 60.0) + uGlow1 * 0.55 * exp(-r1 * 60.0);
  float light = uGlow0 * glow(r0, air) + uGlow1 * glow(r1, air);

  // warm-white at the heart, amber further out
  vec3 colour = mix(vec3(1.0, 0.68, 0.3), vec3(1.0, 0.93, 0.76), clamp(core * 1.6, 0.0, 1.0));
  // premultiplied, a little brighter than its cover: it lightens the page
  gl_FragColor = vec4(colour * light, clamp(light * 0.7, 0.0, 0.85));
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * The bloom canvas, lit by the lanterns whose glass layers are `glows`
 * (the first is the large lantern). Returns { play, pause, render, stop },
 * or null without WebGL.
 */
export function createBloom(canvas, glows, motion) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  const vertex = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!gl || !vertex || !fragment) {
    canvas.dataset.fallback = "";
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    canvas.dataset.fallback = "";
    return null;
  }
  gl.useProgram(program);
  // one triangle covering the canvas
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(["uTime", "uLight0", "uLight1", "uGlow0", "uGlow1", "uSize"].map((n) => [n, gl.getUniformLocation(program, n)]));

  let ratio = 1;
  const resize = () => {
    ratio = Math.min(window.devicePixelRatio || 1, 2) * RESOLUTION;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  const observer = new ResizeObserver(() => {
    resize();
    render();
  });
  observer.observe(canvas);

  let time = 0;
  const flickerDepth = motion?.lanternFlicker ?? 0.08;
  // a flame's gentle, irregular breathing (never a pulse): sines that never line up
  const flicker = (s, seed) => 1 - flickerDepth * (0.5 + 0.5 * Math.sin(s * 5.3 + seed) * Math.sin(s * 2.1 + seed * 1.7 + 0.6));

  // the centre of a lantern's light in canvas px (y up), where its glass
  // layer is brightest (42% down it - its gradient's centre)
  const lightAt = (glowEl, box) => {
    const r = glowEl.getBoundingClientRect();
    return [(r.left + r.width / 2 - box.left) * ratio, (box.bottom - (r.top + r.height * 0.42)) * ratio];
  };

  function render() {
    if (!canvas.clientWidth || !glows[0]) return;
    const box = canvas.getBoundingClientRect();
    const l0 = lightAt(glows[0], box);
    const l1 = glows[1] ? lightAt(glows[1], box) : l0;
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uLight0, l0[0], l0[1]);
    gl.uniform2f(u.uLight1, l1[0], l1[1]);
    gl.uniform1f(u.uGlow0, flicker(time, 0));
    gl.uniform1f(u.uGlow1, glows[1] ? 0.6 * flicker(time, 2.4) : 0);
    gl.uniform1f(u.uSize, Math.max(1, glows[0].parentElement.offsetHeight * ratio));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const step = (_, deltaMs) => {
    time += Math.min(deltaMs, 50) / 1000;
    render();
  };

  let running = false;
  return {
    play() {
      if (running) return;
      running = true;
      gsap.ticker.add(step);
    },
    pause() {
      if (!running) return;
      running = false;
      gsap.ticker.remove(step);
    },
    render,
    stop() {
      this.pause();
      observer.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
