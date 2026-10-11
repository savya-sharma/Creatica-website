// "DRAG" cursor shown while the mouse is over the carousel stage.
//
// A plain DOM element (styles in people.css). It appears only while the
// pointer is over a portrait image - not over captions, gaps or empty space -
// as decided by the `hitTest` callback. The test runs every frame while the
// mouse is over the stage, since the carousel moves under a still pointer.
// It scales/fades in, follows the pointer with light frame-rate independent
// smoothing, and fades out. Mouse only - touch and pen keep their native
// behaviour; no frame loop runs while the mouse is outside the stage.

import { MAX_FRAME_DT, expDamp } from "./math.js";

const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export class DragCursor {
  /**
   * @param {HTMLElement} stage the element the cursor appears over
   * @param {{ label?: string, smoothing?: number, hitTest?: (x: number, y: number) => boolean }} options
   */
  constructor(stage, { label = "Drag", smoothing = 22, hitTest = () => true } = {}) {
    this.stage = stage;
    this.hitTest = hitTest;
    this.inside = false;
    this.smoothing = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? Infinity : smoothing;
    this.enabled = window.matchMedia(FINE_POINTER).matches;
    this.raf = 0;
    this.visible = false;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.lastTime = 0;
    if (!this.enabled) return;

    this.el = document.createElement("div");
    this.el.className = "drag-cursor";
    this.el.setAttribute("aria-hidden", "true");
    this.el.innerHTML = `<div class="drag-cursor__disc"><span class="drag-cursor__label"></span></div>`;
    this.el.querySelector(".drag-cursor__label").textContent = label;
    document.body.appendChild(this.el);

    this.onEnter = (e) => {
      if (e.pointerType !== "mouse") return;
      this.targetX = e.clientX;
      this.targetY = e.clientY;
      this.inside = true;
      if (!this.raf) {
        this.lastTime = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      }
    };
    this.onMove = (e) => {
      if (e.pointerType !== "mouse") return;
      this.targetX = e.clientX;
      this.targetY = e.clientY;
      if (!this.inside) this.onEnter(e);
    };
    this.onLeave = (e) => {
      if (e.pointerType !== "mouse") return;
      this.inside = false;
      this.hide();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    };
    this.tick = this.tick.bind(this);

    stage.addEventListener("pointerenter", this.onEnter);
    stage.addEventListener("pointermove", this.onMove);
    stage.addEventListener("pointerleave", this.onLeave);
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    // appear right at the pointer, not sliding in from where it last hid
    this.x = this.targetX;
    this.y = this.targetY;
    this.place();
    this.el.classList.add("is-visible");
    this.stage.classList.add("has-drag-cursor");
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove("is-visible");
    this.stage.classList.remove("has-drag-cursor");
  }

  place() {
    this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
  }

  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;
    if (this.hitTest(this.targetX, this.targetY)) this.show();
    else this.hide();
    if (!this.visible) return;
    const k = expDamp(this.smoothing, dt);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    this.place();
  }

  dispose() {
    if (!this.enabled) return;
    this.hide();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stage.removeEventListener("pointerenter", this.onEnter);
    this.stage.removeEventListener("pointermove", this.onMove);
    this.stage.removeEventListener("pointerleave", this.onLeave);
    this.el.remove();
    this.enabled = false;
  }
}
