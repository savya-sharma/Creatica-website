"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { projects } from "@/data/projects";

export default function Brands() {
  const overlayRef = useRef(null);
  const layerARef = useRef(null);
  const layerBRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const list = listRef.current;
    const layerA = layerARef.current;
    const layerB = layerBRef.current;
    const rows = list.querySelectorAll(".work-item");

    const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
    const supportsHover = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;

    const moveX = gsap.quickTo(overlay, "left", { duration: 0.35, ease: "power3" });
    const moveY = gsap.quickTo(overlay, "top", { duration: 0.35, ease: "power3" });

    let activeLayer = null;
    let activeSrc = null;

    const LERP_FACTOR = 0.08;
    const cancelLerp = new Map();

    // continuously interpolates a layer's scale toward `target`, re-reading the
    // current value every animation frame instead of following a fixed-duration
    // curve -- each step covers a fraction of the *remaining* distance, so the
    // motion naturally eases without any easing function, and reads noticeably
    // smoother/more liquid than a tweened curve for this kind of reveal
    function lerpScale(layer, target, onSettled) {
      cancelLerp.get(layer)?.();

      let rafId;
      function step() {
        const current = gsap.getProperty(layer, "scale");
        const next = current + (target - current) * LERP_FACTOR;

        if (Math.abs(target - next) < 0.001) {
          gsap.set(layer, { scale: target });
          cancelLerp.delete(layer);
          onSettled?.();
          return;
        }

        gsap.set(layer, { scale: next });
        rafId = requestAnimationFrame(step);
      }

      rafId = requestAnimationFrame(step);
      cancelLerp.set(layer, () => cancelAnimationFrame(rafId));
    }

    // a slow, near-imperceptible zoom that kicks in once an image has fully
    // revealed -- keeps the frame feeling alive while the row stays hovered.
    // killed automatically next time gsap.killTweensOf(layer) runs, since it
    // targets the same DOM node.
    function startIdleDrift(layer) {
      gsap.to(layer, {
        scale: 1.045,
        duration: 5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }

    // reveals the overlay's image as a growing window over whatever is already
    // there: the previous image is pinned fully visible and static underneath
    // -- it never fades or shrinks -- while the new one scales up from the
    // center, on top, gradually covering it. Reuses the same two <img> nodes
    // so nothing is destroyed/recreated and there's no flicker.
    function showImage(src) {
      if (src === activeSrc) return;

      const incoming = activeLayer === layerA ? layerB : layerA;
      const outgoing = activeLayer;

      gsap.killTweensOf([layerA, layerB]);
      cancelLerp.get(layerA)?.();
      cancelLerp.get(layerB)?.();

      if (outgoing) {
        // stays exactly as-is underneath -- no fade, no scale, just sits there
        // until the incoming image has grown enough to cover it
        gsap.set(outgoing, { opacity: 1, scale: 1, zIndex: 1 });
      }

      incoming.src = src;
      gsap.set(incoming, { opacity: 0, scale: 0, transformOrigin: "50% 50%", zIndex: 2 });

      // a quick opacity ramp only softens the edge of the growing window --
      // it's not a crossfade, the reveal itself is carried entirely by scale
      gsap.to(incoming, { opacity: 1, duration: 0.2, ease: "power2.out" });
      lerpScale(incoming, 1, () => startIdleDrift(incoming));

      activeLayer = incoming;
      activeSrc = src;
    }

    function show(row, x, image) {
      const rect = row.getBoundingClientRect();
      moveY(rect.top + rect.height / 2);
      moveX(x);
      gsap.killTweensOf(overlay, "opacity");
      gsap.to(overlay, { opacity: 1, duration: 0.35, ease: "power2.out" });
      showImage(image);
    }

    function hide() {
      gsap.killTweensOf(overlay, "opacity");
      gsap.killTweensOf([layerA, layerB]);
      cancelLerp.get(layerA)?.();
      cancelLerp.get(layerB)?.();

      // both layers can be visible at once mid-transition (the old image still
      // sits fully opaque underneath the growing one), so shrink whichever are
      // on screen together -- otherwise the topmost one shrinking away would
      // re-expose the other one still sitting there at full size
      gsap.to([layerA, layerB], {
        scale: 0,
        duration: 0.5,
        ease: EASE,
        onComplete: () => {
          gsap.set(overlay, { opacity: 0 });
          // fully reset so the next hover always re-triggers a fresh reveal,
          // even if it's the same image that was just showing
          activeLayer = null;
          activeSrc = null;
        },
      });
    }

    const bindings = [];

    if (supportsHover) {
      rows.forEach((row) => {
        const project = projects[Number(row.dataset.index)];
        const onEnter = (e) => show(row, e.clientX, project.image);
        const onMove = (e) => moveX(e.clientX);

        row.addEventListener("mouseenter", onEnter);
        row.addEventListener("mousemove", onMove);
        row.addEventListener("mouseleave", hide);

        bindings.push({ row, onEnter, onMove });
      });

      // safety net: guarantees the overlay hides even if the cursor exits
      // the list without cleanly leaving through a row's own boundary
      list.addEventListener("mouseleave", hide);
    }

    return () => {
      bindings.forEach(({ row, onEnter, onMove }) => {
        row.removeEventListener("mouseenter", onEnter);
        row.removeEventListener("mousemove", onMove);
        row.removeEventListener("mouseleave", hide);
      });
      list.removeEventListener("mouseleave", hide);
      gsap.killTweensOf([layerA, layerB, overlay]);
      cancelLerp.get(layerA)?.();
      cancelLerp.get(layerB)?.();
    };
  }, []);

  return (
    <div className="work-section">
      <header className="page-header">
        <h1>Our Work</h1>
      </header>

      <div className="overlay" ref={overlayRef}>
        <img className="overlay__img" alt="" ref={layerARef} />
        <img className="overlay__img" alt="" ref={layerBRef} />
      </div>

      <ul className="work-list" ref={listRef}>
        {projects.map((p, i) => (
          <li className="work-item" data-index={i} key={p.name}>
            <span className="work-item__index">{String(i + 1).padStart(2, "0")}</span>
            <span className="work-item__name">{p.name}</span>
            <span className="work-item__direction">{p.direction}</span>
            <a className="work-item__demo" href={p.demo}>
              Demo
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
