"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onPreloaderDone } from "@/lib/preloader";

gsap.registerPlugin(MotionPathPlugin, ScrollTrigger);

// "The Idea in Motion": a hand-drawn flight path from the first sticky note
// to the second, with a paper airplane riding its tip. Two variants of the
// same drawing - the desktop curve dips under the pair and rises into the
// second note; on phones (notes stacked diagonally) a shorter curve leaves
// the first note's side and drops onto the second. Only the visible one is
// animated (gsap.matchMedia), on a repeating cycle that starts once the
// preloader has revealed the hero and pauses while it is off screen.

// a small paper plane drawn around (0, 0), nose pointing along +x
function Plane({ planeRef }) {
  return (
    <g ref={planeRef} className="hero-flight-plane">
      <path d="M7.5 0L-6.5-5.6-3 0-6.5 5.6Z" />
      <path className="hero-flight-soft" d="M7.5 0H-3M-3 0l1.3 3.3" />
    </g>
  );
}

export default function IdeaInMotion() {
  const rootRef = useRef(null);
  const wideRef = useRef({ path: null, plane: null });
  const narrowRef = useRef({ path: null, plane: null });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mm = gsap.matchMedia();

    const setup = ({ path, plane }) => {
      if (!path || !plane) return undefined;
      // the plane rides the path with its nose along the tangent
      const onPath = (start, end) => ({
        path,
        align: path,
        alignOrigin: [0.5, 0.5],
        autoRotate: true,
        start,
        end,
      });

      if (reduced) {
        // completed path, plane parked at its end - jumped to the end of a
        // full-path tween, since a zero-length segment has no tangent to
        // align the nose to
        gsap.set(path, { strokeDashoffset: 0 });
        const park = gsap.to(plane, { motionPath: onPath(0, 1), autoAlpha: 1, duration: 1, paused: true });
        park.progress(1);
        return () => {
          park.kill();
          gsap.set([path, plane], { clearProps: "all" });
        };
      }

      // pathLength="1" makes the whole dash 0..1, so GSAP must not round it
      // to whole pixels (its default) or the line would snap, not draw
      gsap.set(path, { strokeDasharray: 1, strokeDashoffset: 1, autoRound: false });
      gsap.set(plane, { autoAlpha: 0, motionPath: onPath(0, 0) });

      // One flight, repeated on a fixed cycle (~8s): the line draws while the
      // plane rides its tip (same timeline, same ease, so the plane is always
      // exactly at the end of the drawn line), a small settle on arrival, a
      // hold, then the line flies out - erasing from its start towards the
      // plane - as the plane fades, a short rest, and the next flight.
      // dashoffset 1 and -1 both show only the gap, so the loop is seamless.
      const FLIGHT = 2.1;
      const HOLD = 3.2;
      const tl = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1 });
      tl.to(plane, { autoAlpha: 1, duration: 0.25, ease: "none" }, 0)
        .to(path, { strokeDashoffset: 0, autoRound: false, duration: FLIGHT, ease: "power2.inOut" }, 0)
        .to(plane, { motionPath: onPath(0, 1), duration: FLIGHT, ease: "power2.inOut" }, 0)
        // a breath at the destination: a tiny settle, then it rests
        .to(plane, { scale: 1.08, duration: 0.18, ease: "power1.out" }, ">")
        .to(plane, { scale: 1, duration: 0.5, ease: "power2.out" }, ">")
        // fly out
        .to(path, { strokeDashoffset: -1, autoRound: false, duration: 1, ease: "power2.in" }, `>+=${HOLD}`)
        .to(plane, { autoAlpha: 0, duration: 0.6, ease: "power1.in" }, "<+=0.4");

      // The first flight starts right as the preloader hands over - a frame
      // that can be very long while the hero's WebGL warms up - and the site
      // turns GSAP's lag smoothing off (SmoothScroll), so a plain play()
      // could jump a whole flight in that one frame. Instead the timeline is
      // advanced by real frame time with each step capped: a hitch briefly
      // slows the plane rather than skipping it. It only advances while the
      // hero is on screen, so the loop never runs in the background.
      const MAX_STEP = 1 / 20;
      let onScreen = true;
      const advance = (time, deltaTime) => {
        if (!onScreen) return;
        tl.totalTime(tl.totalTime() + Math.min(deltaTime / 1000, MAX_STEP));
      };
      let startCall = null;
      let startTrigger = null;
      const visibility = ScrollTrigger.create({
        trigger: root,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => {
          onScreen = self.isActive;
        },
      });
      const stopWaiting = onPreloaderDone(() => {
        startTrigger = ScrollTrigger.create({
          trigger: root,
          start: "top 92%",
          once: true,
          // a short beat so the hand-over frame has passed
          onEnter: () => {
            startCall = gsap.delayedCall(0.35, () => gsap.ticker.add(advance));
          },
        });
      });

      return () => {
        stopWaiting();
        startTrigger?.kill();
        visibility.kill();
        startCall?.kill();
        gsap.ticker.remove(advance);
        tl.kill();
        gsap.set([path, plane], { clearProps: "all" });
      };
    };

    mm.add("(min-width: 641px)", () => setup(wideRef.current));
    mm.add("(max-width: 640px)", () => setup(narrowRef.current));
    return () => mm.revert();
  }, []);

  return (
    <span className="hero-flight" ref={rootRef} aria-hidden="true">
      {/* desktop / tablet: under the pair, rising into the second note */}
      <svg className="hero-flight-svg hero-flight-svg--wide" viewBox="0 0 170 70" focusable="false">
        <path
          ref={(el) => (wideRef.current.path = el)}
          className="hero-flight-path"
          pathLength="1"
          d="M6 5c3.6 21.5 21.3 39.4 47.4 45.6 24.3 5.8 46.6 2.1 64.4-7.7 12.1-6.8 20.8-13.7 29.6-19.6"
        />
        <Plane planeRef={(el) => (wideRef.current.plane = el)} />
      </svg>
      {/* phones: off the first note's side, dropping onto the second */}
      <svg className="hero-flight-svg hero-flight-svg--narrow" viewBox="0 0 90 80" focusable="false">
        <path
          ref={(el) => (narrowRef.current.path = el)}
          className="hero-flight-path"
          pathLength="1"
          d="M3 8.5c15.4-2.9 32.6 1.2 43.8 12.6 9.7 9.9 14.6 23.1 20.1 37.4"
        />
        <Plane planeRef={(el) => (narrowRef.current.plane = el)} />
      </svg>
    </span>
  );
}
