"use client";

import { useEffect } from "react";
import HeroFluid from "./HeroFluid";
import { onLenisReady } from "@/lib/lenis";

export default function Hero() {
  // a reload on Home should always land back on the Hero, never wherever
  // the page happened to be scrolled to - disabling the browser's own
  // scroll restoration (see the inline script in layout.js) is the root
  // fix for that, but this reaffirms position 0 on mount so nothing can be
  // visibly scrolled away from the top, and keeps Lenis's own scroll state
  // in sync so a later scroll doesn't snap back from a stale position
  useEffect(() => {
    window.scrollTo(0, 0);
    return onLenisReady((lenis) => lenis.scrollTo(0, { immediate: true }));
  }, []);

  return (
    <section className="hero">
      <HeroFluid />

      <div className="hero-content">
        <div className="hero-lead">
          <p className="hero-eyebrow">
            We give ambition a visual language — distinctive, meaningful, and
            made to last.
          </p>
          <span className="hero-heading-lead">where</span>
        </div>

        <div className="hero-heading-row">
          <h1 className="hero-heading">
            We shape ideas
            <br />
            into experiences
            <br />
            worth remembering.
          </h1>
        </div>
      </div>
    </section>
  );
}
