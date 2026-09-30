"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { lenisStore, LENIS_READY_EVENT } from "@/lib/lenis";
import { routeHistory } from "@/lib/routeHistory";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScroll() {
  const pathname = usePathname();
  const lastPath = useRef(null);

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

    // ScrollTrigger only re-measures on window resize, but the document
    // also changes height on its own: lazy images, web fonts swapping in,
    // SplitText re-wrapping. Stale trigger positions make reveals fire
    // late, or - with `once` triggers past the new end of the page - never,
    // leaving text hidden. Re-measure whenever the page's height actually
    // changes (coalesced, since several loads usually land together).
    let lastHeight = document.documentElement.scrollHeight;
    let refreshTimer = 0;
    const heightObserver = new ResizeObserver(() => {
      const height = document.documentElement.scrollHeight;
      if (height === lastHeight) return;
      lastHeight = height;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
    });
    heightObserver.observe(document.body);
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) ScrollTrigger.refresh();
    });

    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      heightObserver.disconnect();
      gsap.ticker.remove(updateLenis);
      unsubscribeScrollTrigger();
      lenisStore.instance = null;
      lenis.destroy();
    };
  }, []);

  // A client-side navigation hands over to a new page: stop any smooth
  // scroll still in flight from the old one (it would otherwise keep easing
  // toward the previous page's target and land the new page mid-way down),
  // start at the top, and re-measure every trigger against the new layout
  // once it has been committed.
  useEffect(() => {
    // compared against the last path seen rather than "first run", so a
    // Strict Mode effect re-run isn't counted as a navigation
    if (lastPath.current === null || lastPath.current === pathname) {
      lastPath.current = pathname;
      return undefined;
    }
    lastPath.current = pathname;
    routeHistory.inAppNavigations++;
    const lenis = lenisStore.instance;
    lenis?.scrollTo(0, { immediate: true, force: true });
    lenis?.resize();
    const frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
