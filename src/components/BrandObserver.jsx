"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

// "Brand Observer": the hand-drawn eye under the hero's second sticky note
// ("A brand is more than what people see"). The outline stays put; the iris
// and pupil follow the cursor anywhere in the hero, clamped to an ellipse
// that keeps the iris inside the almond (and the pupil inside the iris), and
// ease back to centre when the pointer leaves. It blinks now and then.
// Strokes keep pathLength="1" so they take part in the doodles' draw-in.

// how far the iris may travel from centre, in viewBox units. The almond is
// 64 wide and ~30 tall at its middle with an 8-radius iris, so there is far
// more room sideways than up/down - an ellipse, not a circle.
const IRIS_RANGE_X = 9;
const IRIS_RANGE_Y = 3.4;
// the pupil drifts a little further than the iris (a hint of depth); at full
// range that is 2.3 x 0.9 units - well inside the iris (8 - 2.6 radius)
const PUPIL_EXTRA = 0.25;
// cursor distance (px) at which the gaze reaches its full range
const REACH_PX = 320;

export default function BrandObserver({ className = "" }) {
  const rootRef = useRef(null);
  const lidRef = useRef(null);
  const irisRef = useRef(null);
  const pupilRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const lid = lidRef.current;
    const iris = irisRef.current;
    const pupil = pupilRef.current;
    if (!root || !lid || !iris || !pupil) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // occasional natural blinks: a quick close, a slightly slower open,
    // sometimes twice in a row; first one after the doodles have drawn in
    let blinkTimer = 0;
    const blink = () => {
      const tl = gsap.timeline({ defaults: { transformOrigin: "50% 50%" } });
      tl.to(lid, { scaleY: 0.06, duration: 0.09, ease: "power2.in" })
        .to(lid, { scaleY: 1, duration: 0.17, ease: "power2.out" });
      if (Math.random() < 0.2) {
        tl.to(lid, { scaleY: 0.06, duration: 0.08, ease: "power2.in" }, "+=0.08")
          .to(lid, { scaleY: 1, duration: 0.16, ease: "power2.out" });
      }
      blinkTimer = window.setTimeout(blink, 2800 + Math.random() * 4200);
    };
    blinkTimer = window.setTimeout(blink, 3600);

    // cursor tracking: fine pointers only (nothing to follow on touch)
    const hero = root.closest(".hero");
    const canTrack = hero && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let onMove = null;
    let onLeave = null;
    if (canTrack) {
      const tween = { duration: 0.6, ease: "power3.out" };
      const irisX = gsap.quickTo(iris, "x", tween);
      const irisY = gsap.quickTo(iris, "y", tween);
      const pupilX = gsap.quickTo(pupil, "x", { ...tween, duration: 0.75 });
      const pupilY = gsap.quickTo(pupil, "y", { ...tween, duration: 0.75 });
      const look = (x, y) => {
        irisX(x);
        irisY(y);
        pupilX(x * PUPIL_EXTRA);
        pupilY(y * PUPIL_EXTRA);
      };

      onMove = (event) => {
        // the eye's live centre (it floats with its note)
        const rect = root.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) return look(0, 0);
        // direction, scaled by how far away the cursor is (eased so close
        // movements stay gentle), mapped onto the clamping ellipse
        const reach = 1 - (1 - Math.min(1, dist / REACH_PX)) ** 2;
        look((dx / dist) * reach * IRIS_RANGE_X, (dy / dist) * reach * IRIS_RANGE_Y);
      };
      onLeave = () => look(0, 0);
      hero.addEventListener("pointermove", onMove);
      hero.addEventListener("pointerleave", onLeave);
    }

    return () => {
      window.clearTimeout(blinkTimer);
      if (onMove) hero.removeEventListener("pointermove", onMove);
      if (onLeave) hero.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf([lid, iris, pupil]);
    };
  }, []);

  return (
    <span className={`hero-doodle hero-doodle--eye ${className}`} ref={rootRef} aria-hidden="true">
      <svg viewBox="0 0 72 40" focusable="false">
        {/* eyelid crease, faint */}
        <path className="brand-eye-soft" pathLength="1" d="M11.5 11.2c6.6-5.4 15-8.3 24.6-8.3 9.3 0 17.4 2.8 24 8" />
        <g ref={lidRef}>
          {/* almond: upper and lower lids drawn as two slightly uneven strokes */}
          <path pathLength="1" d="M4 20.4c7.6-9.6 18.6-15 32.2-15.1 13.3-.1 24.3 5.1 31.8 14.4" />
          <path pathLength="1" d="M4 20.4c7.9 9.3 18.7 14.4 31.8 14.4 13.5 0 24.5-5.3 32.2-15.1" />
          {/* tear-duct corner */}
          <path className="brand-eye-soft" pathLength="1" d="M7.4 20.6c1.3-.9 2.6-1.1 3.9-.6" />
          <g ref={irisRef}>
            <circle pathLength="1" cx="36" cy="20" r="8" />
            <circle className="brand-eye-soft" pathLength="1" cx="36" cy="20" r="5.3" />
            {/* catch-light */}
            <path className="brand-eye-soft" pathLength="1" d="M32.2 16.4c.9-1 2-1.6 3.3-1.8" />
            <g ref={pupilRef}>
              <circle pathLength="1" cx="36" cy="20" r="2.6" />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
