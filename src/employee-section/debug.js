// Development-only geometry inspector. Loaded only when `debug: true`.
//
//  - main view: cylinder arc (floor line), cylinder centre, centre axis,
//    target outline per plane (cyan) vs current mesh outline (amber)
//  - inset: orthographic top-down view of the same scene plus the camera
//    position and its horizontal field of view
//  - labels: index, theta, x/z and current -> target for every visible plane

import {
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  OrthographicCamera,
} from "three";

const LAYER_HELPERS = 1; // main + top view
const LAYER_TOP_ONLY = 2; // top view only

function line(points, material, Kind = Line) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return new Kind(geometry, material);
}

export class FormationDebug {
  constructor(carousel) {
    this.carousel = carousel;
    this.group = new Group();
    carousel.scene.add(this.group);
    carousel.camera.layers.enable(LAYER_HELPERS);

    this.materials = {
      arc: new LineBasicMaterial({ color: 0x6b7f80 }),
      axis: new LineBasicMaterial({ color: 0xff5a5a }),
      target: new LineBasicMaterial({ color: 0x3fe0ff, depthTest: false, transparent: true, opacity: 0.9 }),
      current: new LineBasicMaterial({ color: 0xffb03b, depthTest: false, transparent: true, opacity: 0.9 }),
      camera: new LineBasicMaterial({ color: 0xffffff }),
    };
    this.edges = new EdgesGeometry(carousel.geometry);
    this.ghosts = [];
    this.outlines = [];
    this.staticObjects = [];

    this.topCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.topCamera.layers.enable(LAYER_HELPERS);
    this.topCamera.layers.enable(LAYER_TOP_ONLY);

    this.overlay = document.createElement("div");
    this.overlay.className = "people-debug";
    this.overlay.setAttribute("aria-hidden", "true");
    carousel.container.appendChild(this.overlay);
    this.labels = [];
    this.legend = document.createElement("div");
    this.legend.className = "people-debug__legend";
    this.overlay.appendChild(this.legend);
  }

  /** Rebuild layout-dependent helpers (arc, axis, camera rays). */
  rebuild() {
    for (const object of this.staticObjects) {
      this.group.remove(object);
      object.geometry.dispose();
    }
    this.staticObjects = [];
    const { layout, cameraDistance: d } = this.carousel;
    const floor = -layout.planeHeight / 2 - 0.04;

    const add = (object, layer = LAYER_HELPERS) => {
      object.layers.set(layer);
      this.group.add(object);
      this.staticObjects.push(object);
    };

    // the formation curve at floor height, a little past the visible range
    const reachArc = (this.carousel.visibleLimit + 1.5) * layout.pitch;
    const p = { x: 0, z: 0, theta: 0 };
    const curve = [];
    let minX = 0;
    let maxX = 0;
    let minZ = 0;
    for (let i = 0; i <= 160; i++) {
      layout.curve.sample(-reachArc + (2 * reachArc * i) / 160, p);
      curve.push(p.x, floor, p.z);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
    }
    add(line(curve, this.materials.arc));
    const c = 0.08;
    // centre axis down the middle, through the front of the curve to the camera
    const axisBack = layout.profile === "cylinder" ? -layout.radius : minZ;
    add(line([0, floor, axisBack, 0, floor, d], this.materials.axis));
    if (layout.profile === "cylinder") {
      const r = layout.radius;
      add(line([-c, floor, -r, c, floor, -r, 0, floor, -r - c, 0, floor, -r + c], this.materials.axis, LineSegments));
    }
    // camera marker + horizontal FOV rays (top view only)
    const cam = this.carousel.camera;
    const hHalf = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect);
    const reach = d - minZ + 1;
    add(
      line(
        [0, 0, d, -Math.sin(hHalf) * reach, 0, d - Math.cos(hHalf) * reach, 0, 0, d, Math.sin(hHalf) * reach, 0, d - Math.cos(hHalf) * reach],
        this.materials.camera,
        LineSegments
      ),
      LAYER_TOP_ONLY
    );
    add(line([-c, 0, d - c, c, 0, d + c, -c, 0, d + c, c, 0, d - c], this.materials.camera, LineSegments), LAYER_TOP_ONLY);

    // top camera frames the whole arc plus the camera
    const halfX = Math.max(-minX, maxX) * 1.05;
    const backZ = Math.min(minZ, axisBack) - 0.4;
    const maxZ = d + 0.4;
    const top = this.topCamera;
    top.position.set(0, 20, (backZ + maxZ) / 2);
    // straight down the y axis, with -z (into the scene) pointing up
    top.rotation.set(-Math.PI / 2, 0, 0);
    this.topSpan = { halfX, halfZ: (maxZ - backZ) / 2 };
  }

  syncPool(slots) {
    while (this.ghosts.length < slots.length) {
      const ghost = new LineSegments(this.edges, this.materials.target);
      ghost.layers.set(LAYER_HELPERS);
      ghost.renderOrder = 10;
      this.group.add(ghost);
      this.ghosts.push(ghost);

      const outline = new LineSegments(this.edges, this.materials.current);
      outline.layers.set(LAYER_HELPERS);
      outline.renderOrder = 11;
      slots[this.outlines.length].mesh.add(outline);
      this.outlines.push(outline);

      const label = document.createElement("div");
      label.className = "people-debug__label";
      this.overlay.appendChild(label);
      this.labels.push(label);
    }
    while (this.ghosts.length > slots.length) {
      this.group.remove(this.ghosts.pop());
      this.outlines.pop().removeFromParent();
      this.labels.pop().remove();
    }
  }

  update() {
    const carousel = this.carousel;
    const { slots, camera, size } = carousel;
    this.syncPool(slots);
    const v = this.projected ?? (this.projected = carousel.camera.position.clone());

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const target = slot.target;
      const ghost = this.ghosts[i];
      const label = this.labels[i];
      ghost.visible = slot.mesh.visible;
      ghost.position.set(target.x, target.y, target.z);
      ghost.rotation.y = target.rotationY;
      ghost.scale.set(target.scale * carousel.layout.planeWidth, target.scale * carousel.layout.planeHeight, 1);

      if (!slot.mesh.visible) {
        label.style.display = "none";
        continue;
      }
      v.set(target.x, target.y - (carousel.layout.planeHeight / 2) * target.scale - 0.03, target.z).project(camera);
      const p = slot.mesh.position;
      label.style.display = "block";
      label.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translateX(-50%)`;
      label.textContent =
        `#${i}  u ${slot.logical.toFixed(2)}  t ${target.t.toFixed(2)}\n` +
        `θ ${((target.theta * 180) / Math.PI).toFixed(1)}°  rotY ${((slot.mesh.rotation.y * 180) / Math.PI).toFixed(1)}°\n` +
        `x ${p.x.toFixed(2)}→${target.x.toFixed(2)}\n` +
        `z ${p.z.toFixed(2)}→${target.z.toFixed(2)}`;
    }

    const { layout, cameraDistance } = carousel;
    this.legend.textContent =
      (layout.profile === "cylinder" ? `cylinder r ${layout.radius}` : `bump depth ${layout.bumpDepth} width ${layout.bumpWidth}`) +
      `  pitch ${layout.pitch.toFixed(2)}  frame edge at ±${layout.curveHalfWidth.toFixed(2)} planes\n` +
      `camera z ${cameraDistance.toFixed(2)}  fov ${carousel.camera.fov.toFixed(1)}° (${layout.cameraFov})  ` +
      `visible ±${carousel.visibleLimit.toFixed(2)} planes  pool ${slots.length}\n` +
      `cyan = target  amber = current  red = centre axis`;
  }

  /** Draw the top-down inset after the main render. */
  render(renderer) {
    const { width, height } = this.carousel.size;
    const w = Math.round(Math.min(340, width * 0.34));
    const h = Math.round(w * 0.72);
    const x = Math.round(width * 0.08);
    const y = 12;

    const top = this.topCamera;
    const aspect = w / h;
    let { halfX, halfZ } = this.topSpan;
    if (halfX / halfZ < aspect) halfX = halfZ * aspect;
    else halfZ = halfX / aspect;
    top.left = -halfX;
    top.right = halfX;
    top.top = halfZ;
    top.bottom = -halfZ;
    top.updateProjectionMatrix();

    renderer.setScissorTest(true);
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    renderer.setClearColor(0x000000, 0.8);
    renderer.clear();
    renderer.render(this.carousel.scene, top);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.setClearColor(0x000000, 0);
  }

  dispose() {
    for (const object of this.staticObjects) object.geometry.dispose();
    for (const outline of this.outlines) outline.removeFromParent();
    this.carousel.scene.remove(this.group);
    this.edges.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.overlay.remove();
  }
}
