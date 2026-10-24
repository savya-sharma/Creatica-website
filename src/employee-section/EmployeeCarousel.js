import {
  Color,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { CAROUSEL_CONFIG } from "./config.js";
import {
  edgeFadeAt,
  fitCamera,
  getPlaneTargetTransform,
  intersectRibbon,
  measureFrameEdge,
  resolveLayout,
} from "./formation.js";
import { FluidInteraction, createFluidUniforms, supportsFluid } from "./fluid.js";
import { TextureStore } from "./imageCache.js";
import { PlaneCaptions } from "./captions.js";
import { fragmentShader, vertexShader } from "./shaders.js";
import { MAX_FRAME_DT, clamp, expDamp, mod, whenIdle } from "./math.js";

// Motion model (two layers):
//
//   A. LOGICAL  autoOffset (never stops) + dragOffset (pointer + inertia)
//               = position, measured in planes
//   B. VISUAL   per plane: logical coordinate -> getPlaneTargetTransform()
//               -> current transform damps towards that target
//
// Input only ever touches layer A; meshes are only ever moved by layer B.

const DEFAULT_OPTIONS = {
  background: "#072f33",
  surface: "#cecfc9",
  loadDelay: 0, // artificial texture latency, for testing
  debug: false, // geometry inspector (see debug.js)
  config: null, // partial overrides of CAROUSEL_CONFIG
  onActiveChange: null, // (employee, index) => void
};

let liveInstances = 0;

export class EmployeeCarousel {
  static get liveInstances() {
    return liveInstances;
  }

  /**
   * @param {HTMLElement} container - the stage element; the canvas fills it
   * @param {Array<{image: string, name: string, role: string}>} employees
   * @param {Partial<typeof DEFAULT_OPTIONS>} options
   */
  constructor(container, employees, options = {}) {
    if (!employees.length) throw new Error("EmployeeCarousel needs at least one employee");

    this.container = container;
    this.employees = employees;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.config = { ...CAROUSEL_CONFIG, ...this.options.config };
    this.disposed = false;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // -- renderer / scene ----------------------------------------------------
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "people-carousel__canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    container.appendChild(this.canvas);
    liveInstances++;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(35, 1, 0.05, 100);
    this.cameraDistance = 3;

    const bg = new Color(this.options.background);
    const surface = new Color(this.options.surface);
    this.colors = {
      background: bg,
      surface,
      placeholder: bg.clone().lerp(surface, 0.05),
      css: {
        surface: this.options.surface,
        placeholderTop: `#${bg.clone().lerp(surface, 0.12).getHexString()}`,
        placeholderBottom: `#${bg.clone().lerp(surface, 0.04).getHexString()}`,
      },
    };

    this.textures = new TextureStore({
      renderer: this.renderer,
      colors: this.colors.css,
      framing: {
        // A plane is at most ~60% of the screen height (stage <= 76svh, plane
        // <= ~80% of the stage); 1.5x that keeps minified detail crisp, and
        // anything more is GPU memory nobody sees. Capped at the old 1400px.
        maxHeight: Math.round(clamp(window.screen.height * 0.9 * Math.min(window.devicePixelRatio || 1, 2), 512, 1400)),
        planeAspect: this.config.planeWidth / this.config.planeHeight,
        headTop: this.config.headTop,
        headSize: this.config.headSize,
        minCropPx: this.config.minCropPx,
        pngBackground: this.config.pngBackground,
      },
      loadDelay: this.options.loadDelay,
    });
    for (const employee of employees) this.textures.request(employee);

    // Unit plane, sized per layout through mesh.scale. Dense enough for the
    // curve bend and for the fluid to deform it smoothly.
    this.geometry = new PlaneGeometry(1, 1, 48, 60);
    this.slots = [];
    // Uniforms that only change with the layout, shared by every plane (and
    // its caption) - set once in applyLayout() instead of per plane per frame.
    this.layoutUniforms = {
      uCurveBend: { value: 1 },
      uCurveType: { value: 0 },
      uCurveDepth: { value: 1 },
      uCurveWidth: { value: 1 },
      uCurveRadius: { value: 1 },
      uLift: { value: 0 },
      uLiftDepth: { value: 1 },
      uBorderPx: { value: 1 },
    };

    // Mouse-driven fluid distortion: one shared field for every plane. Off for
    // reduced motion or where half-float render targets are unavailable; the
    // shared uniforms then just stay inactive.
    this.fluidUniforms = createFluidUniforms(this.config);
    this.fluid =
      this.config.fluid && !this.reducedMotion && supportsFluid(this.renderer)
        ? new FluidInteraction(this, this.fluidUniforms)
        : null;

    // Name + role under each plane: canvas text on a strip of the ribbon,
    // distorted by the same fluid (captions.js).
    this.labels = this.config.labels
      ? new PlaneCaptions(this.scene, {
          fontFamily: this.config.labelFontFamily,
          color: this.options.surface,
          fluidUniforms: this.fluidUniforms,
          renderer: this.renderer,
        })
      : null;

    // -- layer A: logical motion ---------------------------------------------
    this.autoOffset = 0;
    this.dragOffset = 0; // smoothed
    this.dragTarget = 0; // raw pointer + inertia
    this.velocity = 0; // inertia, planes/sec
    this.position = 0;
    this.dragging = false;
    this.pointerId = null;
    this.lastPointerX = 0;
    this.lastPointerTime = 0;
    this.planesPerPixel = 0.004;
    this.frameMs = 16.7; // smoothed frame time, so input rules hold at low frame rates

    this.activeIndex = -1;
    this.layout = null;
    this.visibleLimit = 3;
    this.size = { width: 0, height: 0 };
    this.needsLayout = true;

    this.raf = 0;
    this.lastTime = 0;
    this.elapsed = 0;
    this.inView = true;
    this.pageVisible = !document.hidden;
    this.contextLost = false;

    this.debug = null;
    if (this.options.debug) this.setDebug(true);

    // reused by isOverImage(); the canvas rect is cached (see getCanvasRect)
    this.canvasRect = null;
    this.hitRaycaster = new Raycaster();
    this.hitNdc = new Vector2();
    this.hitPoint = { arc: 0, y: 0 };

    this.tick = this.tick.bind(this);
    this.bindEvents();
    this.applyLayout();
    this.updateRunning();
    // warm the fluid passes up while idle, not on the first stroke
    this.fluid?.field.warmUp(whenIdle);
  }

  // ---------------------------------------------------------------------------
  // Events (layer A only)
  // ---------------------------------------------------------------------------

  bindEvents() {
    const el = this.container;
    const listeners = (this.listeners = []);
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners.push(() => target.removeEventListener(type, fn, opts));
    };

    on(el, "pointerdown", (e) => this.onPointerDown(e));
    on(el, "pointermove", (e) => this.onPointerMove(e));
    on(el, "pointerup", (e) => this.onPointerUp(e));
    on(el, "pointercancel", (e) => this.onPointerUp(e));
    on(el, "lostpointercapture", (e) => this.onPointerUp(e));
    on(el, "wheel", (e) => this.onWheel(e), { passive: false });
    on(el, "keydown", (e) => this.onKeyDown(e));
    on(el, "dragstart", (e) => e.preventDefault());
    if (this.fluid) {
      on(el, "pointermove", (e) => this.fluid.onPointerMove(e));
      on(el, "pointerleave", () => this.fluid.onPointerLeave());
    }
    // the cached canvas rect goes stale when the page scrolls or the stage moves
    const staleRect = () => (this.canvasRect = null);
    on(window, "scroll", staleRect, { passive: true });
    on(el, "pointerenter", staleRect);
    on(document, "visibilitychange", () => {
      this.pageVisible = !document.hidden;
      this.updateRunning();
    });
    on(this.canvas, "webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.updateRunning();
    });
    on(this.canvas, "webglcontextrestored", () => {
      this.contextLost = false;
      this.updateRunning();
    });

    // Only flag here; the layout is applied at the start of the next frame.
    // The canvas is absolutely positioned and CSS-sized, so resizing its
    // drawing buffer can never change the observed box -> no resize loop.
    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      this.canvasRect = null;
      if (Math.round(box.width) === this.size.width && Math.round(box.height) === this.size.height) return;
      this.needsLayout = true;
      if (!this.raf) this.renderOnce();
    });
    this.resizeObserver.observe(el);

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        this.inView = entries[entries.length - 1].isIntersecting;
        this.updateRunning();
      },
      { rootMargin: "120px 0px" }
    );
    this.intersectionObserver.observe(el);
  }

  onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.dragging) return;
    // Drags only start on a portrait image (where the drag cursor shows),
    // never from captions, gaps or empty space.
    if (!this.isOverImage(e.clientX, e.clientY)) return;
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastPointerX = e.clientX;
    this.lastPointerTime = e.timeStamp;
    // Grabbing catches any remaining throw, like a hand on a spinning drum.
    this.velocity = 0;
    this.container.setPointerCapture?.(e.pointerId);
    this.container.classList.add("is-dragging");
  }

  onPointerMove(e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastPointerX;
    const dt = (e.timeStamp - this.lastPointerTime) / 1000;
    const delta = dx * this.planesPerPixel;
    this.dragTarget += delta;
    if (dt > 0) {
      // Time-weighted so uneven event rates don't skew the throw.
      this.velocity += (delta / dt - this.velocity) * (1 - Math.exp(-dt / 0.045));
    }
    this.lastPointerX = e.clientX;
    this.lastPointerTime = e.timeStamp;
  }

  onPointerUp(e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    // A pause before release means a deliberate stop: no throw. On a slow
    // frame rate pointer events arrive further apart, so allow three frames
    // (capped, so a real pause still cancels the throw).
    if (e.timeStamp - this.lastPointerTime > Math.min(150, Math.max(90, this.frameMs * 3))) this.velocity = 0;
    const max = this.config.maxVelocity;
    this.velocity = Math.max(-max, Math.min(max, this.velocity));
    if (this.container.hasPointerCapture?.(e.pointerId)) this.container.releasePointerCapture(e.pointerId);
    this.container.classList.remove("is-dragging");
  }

  onWheel(e) {
    // Horizontal trackpad swipes scrub; vertical wheel scrolls the page.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    // like dragging, only over a portrait image
    if (!this.isOverImage(e.clientX, e.clientY)) return;
    e.preventDefault();
    this.dragTarget -= e.deltaX * this.planesPerPixel * 0.8;
  }

  onKeyDown(e) {
    if (e.key === "ArrowLeft") this.dragTarget += 1;
    else if (e.key === "ArrowRight") this.dragTarget -= 1;
    else return;
    e.preventDefault();
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  applyLayout() {
    this.needsLayout = false;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.size.width = width;
    this.size.height = height;
    if (!width || !height) return;

    // up to 2x everywhere: on a 3x phone a 1.5x cap drew portraits and
    // captions at half resolution, then stretched them (the canvas is small)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    const layout = resolveLayout(this.config, width);
    this.layout = layout;
    const lu = this.layoutUniforms;
    lu.uBorderPx.value = Math.max(1, 0.85 * pixelRatio);
    lu.uCurveBend.value = layout.curveBend;
    lu.uCurveType.value = layout.profile === "cylinder" ? 1 : 0;
    lu.uCurveDepth.value = layout.bumpDepth;
    lu.uCurveWidth.value = layout.bumpWidth;
    lu.uCurveRadius.value = layout.radius;
    lu.uLift.value = layout.verticalLift * layout.planeHeight;
    lu.uLiftDepth.value = layout.liftDepth;
    this.canvasRect = null;
    const aspect = width / height;

    const { distance, fov } = fitCamera(layout, aspect);
    this.cameraDistance = distance;
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    // Fixed camera on the centre axis, looking straight down -z (its default
    // orientation). It never moves or re-aims.
    this.camera.position.set(0, 0, this.cameraDistance);
    // Room for the captions: a lens shift (not a camera move or turn) that
    // slides the image up by viewShiftY world units at z = 0, keeping the
    // perspective exactly as it was.
    const halfHeight = distance * Math.tan((fov * Math.PI) / 360);
    if (layout.viewShiftY) {
      const offset = (layout.viewShiftY / (2 * halfHeight)) * height;
      this.camera.setViewOffset(width, height, 0, offset, width, height);
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();

    // Dragging moves the frontmost plane 1:1 with the pointer: world units per
    // pixel at z = 0, divided by the arc length of one plane step.
    const worldPerPixel = (2 * distance * Math.tan((fov * Math.PI) / 360)) / height;
    this.planesPerPixel = (worldPerPixel / layout.pitch) * layout.dragSensitivity;

    const edge = measureFrameEdge(layout, distance, fov, aspect);
    layout.curveHalfWidth = edge.centreAtEdge; // |t| = 1 at the frame edge
    this.visibleLimit = edge.hideBeyond;
    // Pool covers the visible span plus one hidden plane per side, so wrapping
    // (at +-pool/2) always happens out of sight.
    this.ensurePool(2 * Math.ceil(this.visibleLimit) + 2);
    if (this.labels) for (const slot of this.slots) this.labels.resize(slot, layout);
    this.fluid?.resize(layout, this.visibleLimit);
    this.debug?.rebuild();
  }

  ensurePool(count) {
    while (this.slots.length < count) {
      const material = new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0 },
          uReveal: { value: 0 },
          uCoverScale: { value: new Vector2(1, 1) },
          uPlaceholder: { value: this.colors.placeholder },
          uFadeColor: { value: this.colors.background },
          uFade: { value: 0 },
          uBorderColor: { value: this.colors.surface },
          uBorderAlpha: { value: this.config.borderAlpha },
          uTime: { value: 0 },
          uCenterX: { value: 0 },
          uCenterPoint: { value: new Vector2() },
          uArcCenter: { value: 0 },
          uFrameAngle: { value: 0 },
          uPlaneSize: { value: new Vector2(1, 1) },
          uPlaneY: { value: 0 },
          ...this.layoutUniforms,
          ...this.fluidUniforms,
        },
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.visible = false;
      // Vertices are displaced along the curve in the shader, so the unit
      // plane bounds no longer describe the mesh; visibility is handled by
      // the formation instead.
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.slots.push({
        mesh,
        material,
        target: { t: 0, theta: 0, x: 0, y: 0, z: 0, rotationY: 0, scale: 1 },
        currentScale: 1,
        logical: 0,
        initialized: false,
        employeeIndex: -1,
        entry: null,
        texture: null,
        reveal: 0,
        waited: false,
        label: null,
      });
      this.labels?.attach(this.slots[this.slots.length - 1], this.layout);
    }
    while (this.slots.length > count) {
      const slot = this.slots.pop();
      this.labels?.detach(slot);
      this.scene.remove(slot.mesh);
      slot.material.dispose();
    }
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  updateRunning() {
    const shouldRun = !this.disposed && this.inView && this.pageVisible && !this.contextLost;
    if (shouldRun && !this.raf) {
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  renderOnce() {
    if (this.disposed || this.contextLost) return;
    if (this.needsLayout) this.applyLayout();
    if (!this.size.width || !this.size.height) return;
    this.update(0);
    this.render();
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    // Clamp so a dropped frame or tab switch never produces a visible jump.
    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    // smoothed frame time (for the throw-release rule), time-based too
    this.frameMs += (Math.min(now - this.lastTime, 200) - this.frameMs) * expDamp(6, dt);
    this.lastTime = now;
    this.elapsed += dt;

    if (this.needsLayout) this.applyLayout();
    if (!this.size.width || !this.size.height) return;
    this.update(dt);
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    if (this.debug) {
      this.debug.update();
      this.debug.render(this.renderer);
    }
  }

  update(dt) {
    const c = this.config;
    const layout = this.layout;

    // --- layer A: logical position ------------------------------------------
    if (!this.reducedMotion) this.autoOffset -= c.autoSpeed * dt;
    if (!this.dragging) {
      this.dragTarget += this.velocity * dt;
      this.velocity *= Math.exp(-c.dragFriction * dt);
    }
    this.dragOffset += (this.dragTarget - this.dragOffset) * expDamp(c.dragFollow, dt);
    const previous = this.position;
    this.position = this.autoOffset + this.dragOffset;

    // shared fluid field: mouse strokes in, scroll carries it with the content
    this.fluid?.update(dt, this.elapsed, (this.position - previous) * layout.pitch);

    // --- layer B: per-plane target + damped current -------------------------
    const slots = this.slots;
    const poolSize = slots.length;
    const half = poolSize / 2;
    const count = this.employees.length;
    const kPos = expDamp(c.positionDamping, dt);
    const kRot = expDamp(c.rotationDamping, dt);
    const kScale = expDamp(c.scaleDamping, dt);
    const planeAspect = layout.planeWidth / layout.planeHeight;
    let nearest = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < poolSize; i++) {
      const slot = slots[i];
      const { mesh, target } = slot;
      const u = slot.material.uniforms;

      // Continuous logical coordinate, wrapped by the pool length. A wrap is a
      // jump of a whole loop in logical space - the target lands at the
      // mathematically equivalent spot on the other (hidden) side, and the
      // current transform snaps there instead of flying across the screen.
      const logical = mod(i + this.position + half, poolSize) - half;
      const wrapped = Math.abs(logical - slot.logical) > half;
      slot.logical = logical;

      // Who this slot shows comes from its place in the global stream, so the
      // sequence of people is continuous across wraps and resizes.
      const employeeIndex = mod(Math.round(logical - this.position), count);
      if (slot.employeeIndex !== employeeIndex) {
        slot.employeeIndex = employeeIndex;
        slot.entry = this.textures.request(this.employees[employeeIndex]);
        slot.texture = null;
        slot.waited = false;
        u.uHasMap.value = 0;
        u.uMap.value = null;
        this.labels?.setEmployee(slot, this.employees[employeeIndex]);
      }

      getPlaneTargetTransform(logical, layout, target);

      if (!slot.initialized || wrapped) {
        slot.initialized = true;
        mesh.position.set(target.x, target.y, target.z);
        mesh.rotation.y = target.rotationY;
        slot.currentScale = target.scale;
      } else {
        mesh.position.x += (target.x - mesh.position.x) * kPos;
        mesh.position.y += (target.y - mesh.position.y) * kPos;
        mesh.position.z += (target.z - mesh.position.z) * kPos;
        mesh.rotation.y += (target.rotationY - mesh.rotation.y) * kRot;
        slot.currentScale += (target.scale - slot.currentScale) * kScale;
      }
      mesh.scale.set(layout.planeWidth * slot.currentScale, layout.planeHeight * slot.currentScale, 1);

      const distance = Math.abs(logical);
      mesh.visible = distance <= this.visibleLimit;
      if (!mesh.visible) {
        this.labels?.update(slot, layout, 0);
        continue;
      }

      if (distance < nearest) {
        nearest = distance;
        nearestIndex = employeeIndex;
      }

      // Bind the texture once it exists. Planes that were visibly waiting
      // fade the photo in; planes recycled off-screen show it at once.
      const entry = slot.entry;
      if (entry.ready && slot.texture !== entry.texture) {
        slot.texture = entry.texture;
        u.uMap.value = entry.texture;
        u.uHasMap.value = 1;
        slot.reveal = slot.waited ? 0 : 1;
        if (entry.aspect > planeAspect) u.uCoverScale.value.set(planeAspect / entry.aspect, 1);
        else u.uCoverScale.value.set(1, entry.aspect / planeAspect);
      } else if (!entry.ready) {
        slot.waited = true;
      }
      slot.reveal += (1 - slot.reveal) * expDamp(5, dt);
      u.uReveal.value = slot.reveal;

      // curve bending (see shaders.js); the curve constants are layout-level
      u.uCenterX.value = target.x;
      u.uCenterPoint.value.set(target.x, target.z);
      u.uArcCenter.value = logical * layout.pitch;
      // the current rotation, so the bent shape is exact relative to where
      // the damped transform actually is
      u.uFrameAngle.value = mesh.rotation.y;
      u.uPlaneSize.value.set(mesh.scale.x, mesh.scale.y);
      u.uPlaneY.value = mesh.position.y;

      u.uFade.value = layout.edgeFade ? edgeFadeAt(target.t, layout) : 0;
      // captions follow the plane's current transform; fade in with its photo
      this.labels?.update(slot, layout, slot.reveal * (1 - u.uFade.value));
      u.uTime.value = this.elapsed;
    }

    if (nearestIndex !== -1 && nearestIndex !== this.activeIndex) {
      this.activeIndex = nearestIndex;
      this.options.onActiveChange?.(this.employees[nearestIndex], nearestIndex);
    }
  }

  // ---------------------------------------------------------------------------
  // Debug / inspection
  // ---------------------------------------------------------------------------

  async setDebug(enabled) {
    if (enabled && !this.debug) {
      const { FormationDebug } = await import("./debug.js");
      if (this.disposed || this.debug) return;
      this.debug = new FormationDebug(this);
      if (this.layout) this.debug.rebuild();
    } else if (!enabled && this.debug) {
      this.debug.dispose();
      this.debug = null;
      this.camera.layers.set(0);
    }
  }

  /**
   * True when a viewport point is over the image strip - a portrait or the
   * gap between two (not a caption or empty space). The pointer is ray-cast
   * onto the ribbon surface and checked against every visible plane's extent.
   */
  isOverImage(clientX, clientY) {
    const layout = this.layout;
    if (!layout || !this.size.width || !this.size.height) return false;
    const rect = this.getCanvasRect();
    this.hitNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.hitRaycaster.setFromCamera(this.hitNdc, this.camera);
    const ray = this.hitRaycaster.ray;
    if (!intersectRibbon(layout, ray.origin, ray.direction, this.hitPoint)) return false;
    for (const slot of this.slots) {
      if (!slot.mesh.visible) continue;
      // Each plane owns half of the gap on either side, so the strip has no
      // holes: the drag circle stays (and dragging works) between images.
      const halfW = Math.max(layout.planeWidth * slot.currentScale, layout.pitch) / 2;
      const halfH = (layout.planeHeight * slot.currentScale) / 2;
      if (
        Math.abs(this.hitPoint.arc - slot.logical * layout.pitch) <= halfW &&
        Math.abs(this.hitPoint.y - slot.mesh.position.y) <= halfH
      ) {
        return true;
      }
    }
    return false;
  }

  /** Canvas position on screen, read once per scroll/resize/enter. */
  getCanvasRect() {
    return (this.canvasRect ??= this.canvas.getBoundingClientRect());
  }

  get activeEmployee() {
    return this.employees[this.activeIndex] ?? null;
  }

  /** Renderer stats, for the debug overlay. */
  get stats() {
    const { memory, render, programs } = this.renderer.info;
    return {
      textures: memory.textures,
      geometries: memory.geometries,
      programs: programs?.length ?? 0,
      calls: render.calls,
      slots: this.slots.length,
      visible: this.slots.filter((s) => s.mesh.visible).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;

    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    for (const off of this.listeners) off();
    this.listeners = [];
    this.container.classList.remove("is-dragging");

    this.debug?.dispose();
    this.debug = null;
    for (const slot of this.slots) {
      this.scene.remove(slot.mesh);
      this.labels?.detach(slot);
      slot.material.dispose();
    }
    this.slots = [];
    this.labels?.dispose();
    this.geometry.dispose();
    // Marks the store disposed first, so in-flight image loads are ignored.
    this.textures.dispose();
    this.fluid?.dispose();
    this.fluid = null;

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    liveInstances--;
  }
}
