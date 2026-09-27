"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { lenisStore, LENIS_READY_EVENT } from "@/lib/lenis";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      // lower than Lenis's own default (0.1), and lower than this project's
      // previous 0.12, for a smoother, more "premium" trail behind the
      // input - a deliberately modest drop, low enough to read as fluid
      // rather than snappy, not so low it reads as laggy/delayed
      lerp: 0.09,
      // explicit, even though it's Lenis's own default: a reduced-motion
      // preference should fall back to plain native scrolling rather than
      // smoothed/lerped motion
      respectReducedMotion: true,
    });

    lenisStore.instance = lenis;
    window.dispatchEvent(new CustomEvent(LENIS_READY_EVENT, { detail: lenis }));

    // this is the actual fix for section reveals triggering late during
    // fast scrolling: Lenis was previously driven by its own independent
    // requestAnimationFrame loop, one frame out of step with GSAP/
    // ScrollTrigger's own ticker, and ScrollTrigger only recalculated
    // trigger positions whenever the browser got around to firing a
    // native scroll event. Routing Lenis's raf through gsap.ticker keeps
    // both on the exact same frame clock, and telling ScrollTrigger to
    // update on every Lenis "scroll" tick keeps every trigger's progress
    // reading Lenis's current interpolated position immediately rather
    // than lagging a frame or more behind it.
    const unsubscribeScrollTrigger = lenis.on("scroll", ScrollTrigger.update);

    function updateLenis(time) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(updateLenis);
    // Lenis already smooths out dropped frames on its own - GSAP's own
    // lag compensation on top of that fights it during fast scrolling
    // instead of helping
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(updateLenis);
      unsubscribeScrollTrigger();
      lenisStore.instance = null;
      lenis.destroy();
    };
  }, []);

  return null;
}
