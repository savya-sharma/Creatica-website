"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { lenisStore, LENIS_READY_EVENT } from "@/lib/lenis";

export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
    });

    lenisStore.instance = lenis;
    window.dispatchEvent(new CustomEvent(LENIS_READY_EVENT, { detail: lenis }));

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenisStore.instance = null;
      lenis.destroy();
    };
  }, []);

  return null;
}
