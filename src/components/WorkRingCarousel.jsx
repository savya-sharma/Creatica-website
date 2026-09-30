"use client";

import { useEffect, useRef } from "react";
import { RingCarousel } from "@/carousel/RingCarousel.js";
import { workSlides } from "@/carousel/workData.js";

// Mirrors the source project's own main.js:
//   const container = document.querySelector(".carousel");
//   const carousel = new RingCarousel(container, slides);
//   if (import.meta.hot) import.meta.hot.dispose(() => carousel.dispose());
// - a ref stands in for the querySelector (React, not a static HTML file),
// and the effect's cleanup function stands in for the Vite HMR dispose hook,
// covering both a dev hot-reload AND a real unmount (e.g. client-side
// navigation away from /work), per the integration brief's Page Lifecycle
// requirements - no WebGL resources should keep running once this page is
// left.
export default function WorkRingCarousel() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const carousel = new RingCarousel(container, workSlides);
    return () => carousel.dispose();
  }, []);

  return (
    <section className="slider">
      <div
        className="carousel"
        ref={containerRef}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label="Work"
        aria-keyshortcuts="ArrowLeft ArrowRight"
      />
    </section>
  );
}
