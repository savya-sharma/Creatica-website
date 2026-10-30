"use client";

import { useEffect, useRef } from "react";
import HeroFluid from "./HeroFluid";
import BrandObserver from "./BrandObserver";
import IdeaInMotion from "./IdeaInMotion";
import { onLenisReady } from "@/lib/lenis";
import { onPreloaderDone } from "@/lib/preloader";
import FestivalSlot from "@/festivals/FestivalSlot";

// Hand-drawn line doodles around the sticky notes, each tied to a note's
// words. Every stroke uses pathLength="1" so the CSS can draw it in once
// (hero--doodles-in) by animating its dash offset.
function Doodle({ className, viewBox, children }) {
  return (
    <span className={`hero-doodle ${className}`} aria-hidden="true">
      <svg viewBox={viewBox} focusable="false">
        {children}
      </svg>
    </span>
  );
}

// fluidInk={false}: the page draws the fluid's ink in a layer shared with
// the sections below (see page.js); the hero still warps its own text
export default function Hero({ fluidInk = true } = {}) {
  const heroRef = useRef(null);

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

  // the doodles draw themselves in once the hero is actually revealed - not
  // underneath the entry preloader (immediately if it already ran)
  useEffect(
    () => onPreloaderDone(() => heroRef.current?.classList.add("hero--doodles-in")),
    []
  );

  return (
    <section className="hero" ref={heroRef}>
      {/* festival decoration (none outside a festival): first, so it sits
          behind the notes, the ink and the headline */}
      <FestivalSlot area="hero" />
      {/* paper notes: before HeroFluid so the fluid's ink drifts over them */}
      <div className="hero-note hero-note--ivory no-select">
        <div className="hero-note-card">
          <div className="hero-note-paper">
            <p className="hero-note-text">
              Great ideas don&apos;t come from following the noise.
            </p>
          </div>
          <span className="hero-note-fold" aria-hidden="true" />
        </div>

        {/* "great ideas": a lightbulb with pulsing rays */}
        <Doodle className="hero-doodle--bulb" viewBox="0 0 64 64">
          <path pathLength="1" d="M32 12c-8.3 0-14.5 6.2-14.5 14.2 0 5.4 3 9 5.6 11.8 1.5 1.6 2.3 3.4 2.3 5.4V46h13.2v-2.6c0-2 .8-3.8 2.3-5.4 2.6-2.8 5.6-6.4 5.6-11.8C46.5 18.2 40.3 12 32 12z" />
          <path pathLength="1" d="M27 50.5h10M28.5 55h7" />
          <path pathLength="1" d="M28.5 35c1.2-2.6 2.3-2.6 3.5 0s2.3 2.6 3.5 0" />
          <g className="hero-doodle-rays">
            <path pathLength="1" d="M32 3v4M14 9.5l2.8 2.8M50 9.5l-2.8 2.8M8 26h4M52 26h4" />
          </g>
        </Doodle>

        {/* "not from following the noise": a jittery waveform, crossed out,
            settling into a calm line */}
        <Doodle className="hero-doodle--noise" viewBox="0 0 120 40">
          <path
            className="hero-doodle-wave"
            pathLength="1"
            d="M4 20h8l4-12 6 24 5-20 5 16 5-22 6 28 5-20 5 12 5-8 6 2h52"
          />
          <path className="hero-doodle-strike" pathLength="1" d="M8 33c20-7 42-15 62-24" />
        </Doodle>

        {/* links the two thoughts: "The Idea in Motion" flight path */}
        <IdeaInMotion />
      </div>

      <div className="hero-note hero-note--lavender no-select">
        <div className="hero-note-card">
          <div className="hero-note-paper">
            <p className="hero-note-text">A brand is more than what people see.</p>
          </div>
          <span className="hero-note-fold" aria-hidden="true" />
        </div>

        {/* "more than what people see": the Brand Observer eye, which
            follows the cursor and blinks */}
        <BrandObserver />

        <Doodle className="hero-doodle--sparkle" viewBox="0 0 24 24">
          <path pathLength="1" d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" />
        </Doodle>
        <Doodle className="hero-doodle--sparkle-sm" viewBox="0 0 24 24">
          <path pathLength="1" d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" />
        </Doodle>
      </div>

      <HeroFluid ink={fluidInk} />

      <div className="hero-content">
        <div className="hero-lead">
          <p className="hero-eyebrow">
            We give ambition a visual language — distinctive, meaningful, and
            made to last.
          </p>
          <span className="hero-heading-lead no-select">where</span>
        </div>

        <div className="hero-heading-row">
          <h1 className="hero-heading no-select">
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
