"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { INTRO_CONFIG } from "@/lib/introLoader/config";
import { IntroReveal } from "@/lib/introLoader/reveal";
import { trackReadiness } from "@/lib/introLoader/readiness";
import { markPreloaderDone } from "@/lib/preloader";
import { onLenisReady } from "@/lib/lenis";

// The site's entry loader (replaces Preloader.jsx in the root layout).
//
// First visit this session:
//   black screen -> a thin square outline rounds into a circle as the count
//   runs 0-100% (driven by real readiness signals, never faster than
//   minDialMs, held at 99% until everything is ready) -> brief hold -> the
//   dial fades -> the black opens organically from the centre (shader) ->
//   gone.
// Every full page load plays this (INTRO_CONFIG.dialEveryLoad); with it off,
// later loads this session get no dial, just a short reveal once ready.
// Reduced motion: no dial or shader, a short fade once ready.
//
// The black overlay is in the server-rendered HTML, so the page under it is
// never seen first. It signals markPreloaderDone() as the reveal starts (the
// hero's doodles, flight path and monitor wait for that) and locks scrolling
// until it is gone. A hard deadline (maxIntroMs) means it can never stick.
// Every frame writes straight to the DOM / shader uniforms - no React
// renders until the very end.
// the dial outline's length (r = 49.5 in a 100 viewBox; matches globals.css)
const CIRCLE = 2 * Math.PI * 49.5;

export default function IntroLoader() {
  const rootRef = useRef(null);
  const [gone, setGone] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const config = INTRO_CONFIG;
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(config.storageKey) === "1";
    } catch {
      // storage blocked: treat as a first visit
    }
    const mode = reduced ? "reduced" : seen && !config.dialEveryLoad ? "quick" : "first";
    root.dataset.mode = mode;

    let cancelled = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    // -- scroll lock -------------------------------------------------------
    html.classList.add("preloader-lock");
    let lockedLenis = null;
    const stopLenisWait = onLenisReady((lenis) => {
      lockedLenis = lenis;
      lenis.stop();
    });
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      stopLenisWait();
      lockedLenis?.start();
      html.classList.remove("preloader-lock");
    };

    // -- the shader: flows behind the dial from the start --------------------
    let reveal = null;
    if (mode !== "reduced") {
      try {
        reveal = new IntroReveal(root, config);
      } catch {
        reveal = null; // no WebGL: the overlay fades instead
      }
    }

    // -- readiness ---------------------------------------------------------
    let progress = 0;
    let ready = false;
    trackReadiness(config.signalTimeoutMs, (p) => (progress = p), reveal ? [reveal.ready] : []).then(() => {
      ready = true;
    });
    // nothing can keep the intro up past this
    let forced = false;
    later(() => {
      forced = true;
      ready = true;
    }, config.maxIntroMs);

    const markSeen = () => {
      try {
        sessionStorage.setItem(config.storageKey, "1");
      } catch {
        // storage blocked: the intro may simply play again next load
      }
    };

    const finish = () => {
      if (cancelled) return;
      unlock();
      reveal?.dispose();
      reveal = null;
      setGone(true);
    };

    const startReveal = async () => {
      if (cancelled) return;
      markSeen();
      markPreloaderDone();
      // no WebGL, reduced motion, or the context was lost (iOS memory
      // pressure): a plain fade instead of the dissolve
      if (!reveal || reveal.lost || mode === "reduced") {
        gsap.to(root, {
          opacity: 0,
          duration: (mode === "reduced" ? config.reducedFadeMs : 500) / 1000,
          ease: "power1.out",
          onComplete: finish,
        });
        return;
      }
      // the canvas (flowing since the loader appeared) dissolves into the
      // hero; the overlay's own background steps aside for it
      const playing = reveal.play(mode === "quick" ? config.quickRevealDuration : config.revealDuration, config.revealEase);
      root.classList.add("is-revealing");
      await playing;
      finish();
    };

    const whenReady = (fn) => {
      const check = () => (cancelled ? null : ready ? fn() : later(check, 50));
      check();
    };

    // -- the dial (first visit only) ---------------------------------------
    let tick = null;
    if (mode === "first") {
      const dial = root.querySelector(".intro-dial");
      const shape = root.querySelector(".intro-shape circle");
      const count = root.querySelector(".intro-count");
      let start = performance.now();
      let shown = 0;
      let last = start;
      // the deliberate hold on one number (INTRO_CONFIG.pauseAt / pauseMs)
      let pausedUntil = 0;
      let paused = !(config.pauseAt > 0 && config.pauseAt < 100 && config.pauseMs > 0);
      gsap.fromTo(dial, { scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" });

      tick = () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        // holding on the pause number: nothing moves; afterwards the clock
        // resumes from where it was, so the count doesn't rush to catch up
        if (pausedUntil) {
          if (now < pausedUntil) return;
          start += config.pauseMs;
          pausedUntil = 0;
        }
        // never ahead of the clock (so the morph is always seen), never
        // ahead of what has really loaded, never 100 until all of it has
        const byTime = forced ? 100 : Math.min(1, (now - start) / config.minDialMs) * 100;
        const byLoad = ready ? 100 : Math.min(99, progress * 100);
        const goal = Math.min(byTime, byLoad);
        shown += (goal - shown) * (1 - Math.exp(-dt * config.countFollow));
        if (goal === 100 && shown > 99.6) shown = 100;
        if (!paused && shown >= config.pauseAt) {
          paused = true;
          shown = config.pauseAt;
          pausedUntil = now + config.pauseMs;
        }
        count.textContent = `${Math.round(shown)}%`;
        // the outline draws with the count: a line from the top, clockwise
        // (towards the right) all the way back to the top at 100
        shape.style.strokeDashoffset = (CIRCLE * (1 - shown / 100)).toFixed(2);
        if (shown < 100) return;
        gsap.ticker.remove(tick);
        tick = null;
        later(() => {
          gsap.to(dial, {
            opacity: 0,
            scale: 0.97,
            duration: config.dialFadeMs / 1000,
            ease: "power2.inOut",
            onComplete: startReveal,
          });
        }, config.holdMs);
      };
      gsap.ticker.add(tick);
    } else {
      whenReady(startReveal);
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (tick) gsap.ticker.remove(tick);
      gsap.killTweensOf(root);
      gsap.killTweensOf(root.querySelector(".intro-dial"));
      reveal?.dispose();
      root.classList.remove("is-revealing");
      unlock();
    };
  }, []);

  if (gone) return null;

  return (
    <div className="intro" ref={rootRef} aria-hidden="true">
      <div className="intro-dial">
        <svg className="intro-shape" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="49.5" />
        </svg>
        <span className="intro-count">0%</span>
      </div>
    </div>
  );
}
