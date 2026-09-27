"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const DURATION = 0.5;
const EASE = "power3.out";

// The site's vertical "rolling" text-hover: two identical copies of the
// label are stacked in a column one line-height apart, clipped to exactly
// one line by the wrapper's own overflow:hidden, and hovering slides that
// column up by one line so the (identical) second copy takes the first
// one's place - the classic "roll the label away, roll an new one in"
// swap, just with nothing actually different underneath.
//
// A single shared component rather than duplicated GSAP per call site:
// wrap a button/link's text with it and nothing else about that element
// needs to change - it listens on its own nearest interactive ancestor
// (the <a>/<button>/<li> it's rendered inside), not on itself, so hovering
// anywhere over the button - not just directly over the letters - triggers
// it, and existing hover/focus handlers already on that ancestor (e.g. the
// Manifesto pills' own mouseenter) keep working untouched alongside it.
//
// Only the two text layers move (translateY via yPercent); the wrapper's
// own box, and the button/link around it, never change size.
export default function RollingText({ children, as: Tag = "span", className = "" }) {
  const trackRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    const target = track?.closest("a, button, li, [data-rolling-hover-target]");
    if (!track || !target) return undefined;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    function rollIn() {
      gsap.to(track, { yPercent: -50, duration: DURATION, ease: EASE, overwrite: "auto" });
    }
    function rollOut() {
      gsap.to(track, { yPercent: 0, duration: DURATION, ease: EASE, overwrite: "auto" });
    }
    function handleFocus(event) {
      // only the keyboard-navigation case, not an incidental focus from a
      // click that a mouseenter already animated
      if (!event.target.matches?.(":focus-visible")) return;
      rollIn();
    }

    target.addEventListener("mouseenter", rollIn);
    target.addEventListener("mouseleave", rollOut);
    target.addEventListener("focus", handleFocus, true);
    target.addEventListener("blur", rollOut, true);

    return () => {
      target.removeEventListener("mouseenter", rollIn);
      target.removeEventListener("mouseleave", rollOut);
      target.removeEventListener("focus", handleFocus, true);
      target.removeEventListener("blur", rollOut, true);
      gsap.killTweensOf(track);
    };
  }, []);

  return (
    <Tag className={`rolling-text${className ? ` ${className}` : ""}`}>
      <span className="rolling-text-track" ref={trackRef}>
        <span className="rolling-text-layer">{children}</span>
        <span className="rolling-text-layer" aria-hidden="true">
          {children}
        </span>
      </span>
    </Tag>
  );
}
