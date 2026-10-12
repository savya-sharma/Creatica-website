"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import gsap from "gsap";
import { RingCarousel } from "@/carousel/RingCarousel.js";
import { workSlides } from "@/carousel/workData.js";
import { lenisStore } from "@/lib/lenis";

// Project detail transition
// -------------------------
// The ring is WebGL, so a clicked "image" is a plane in perspective, not a
// DOM box. FLIP is done with a DOM copy of the image laid out at its final
// size (the "last" box, measured from .work-detail__frame) and mapped back
// onto the plane's projected corners (the "first" shape, from
// RingCarousel.getCardQuad) with a matrix3d homography. Animating the four
// corners from one to the other flies the image out of the ring - tilt and
// perspective included - with no jump at either end. The plane itself is
// hidden while its copy is out, and shown again only once the copy has
// landed back on it. GSAP's Flip plugin measures DOM boxes, so it can't
// start from a projected quad; a GSAP timeline drives the corners instead.

const LIFT = 0.06;            // how much the image grows as it leaves the ring
const CARD_RADIUS = 0.1;      // corner radius as a share of width (see RingCarousel.resize)
const FINAL_RADIUS = 6;       // px, the corner radius once it has landed
const SHADOW = "0px 40px 90px -40px rgba(7, 47, 51, 0.45)";
const NO_SHADOW = "0px 40px 90px -40px rgba(7, 47, 51, 0)";

const subscribeNoop = () => () => {};
const lerp = (a, b, t) => a + (b - a) * t;
const lerpQuad = (a, b, t) => a.map(([x, y], i) => [lerp(x, b[i][0], t), lerp(y, b[i][1], t)]);
const rectQuad = (r) => [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]];

function scaleQuad(quad, scale) {
  const cx = quad.reduce((sum, [x]) => sum + x, 0) / 4;
  const cy = quad.reduce((sum, [, y]) => sum + y, 0) / 4;
  return quad.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
}

// Projective transform taking a w x h box at the viewport origin onto an
// arbitrary quad (clockwise from top-left). Heckbert's square-to-quad
// mapping, rescaled from the unit square to the box.
function quadMatrix(w, h, quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let k = 0;
  if (Math.abs(sx) > 1e-6 || Math.abs(sy) > 1e-6) {
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-6;
    g = (sx * dy2 - dx2 * sy) / den;
    k = (dx1 * sy - sx * dy1) / den;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${x0},${y0},0,1)`;
}

export default function WorkRingCarousel() {
  const containerRef = useRef(null);
  const carouselRef = useRef(null);
  const detailRef = useRef(null);
  const bgRef = useRef(null);
  const mediaRef = useRef(null);
  const imageRef = useRef(null);
  const incomingRef = useRef(null);
  const frameRef = useRef(null);
  const closeRef = useRef(null);
  // Mutable transition state, outside React so animation frames never
  // re-render: phase is idle -> opening -> open -> closing -> idle.
  // Switching (prev/next) happens inside "open"; a close asked for during
  // one waits for it (pendingClose) so the view is never half-swapped.
  const flow = useRef({
    phase: "idle", token: 0, tl: null, cardIndex: -1, itemIndex: -1, corners: null, radius: 0, box: null,
    switching: false, pendingClose: false,
  });
  const handlers = useRef({});

  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const project = activeIndex >= 0 ? workSlides[activeIndex] : null;
  // The view is portalled to <body>: .slider can pick up a runtime
  // will-change: transform, which would make it both the containing block
  // for the fixed layers (breaking viewport coordinates once scrolled) and
  // a stacking context under the nav.
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const carousel = new RingCarousel(container, workSlides, {
      onSelect: (selection) => handlers.current.open(selection),
    });
    carouselRef.current = carousel;
    return () => {
      carouselRef.current = null;
      carousel.dispose();
    };
  }, []);

  useEffect(() => {
    const state = flow.current;
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = () => detailRef.current.querySelectorAll("[data-reveal]");
    // the project-specific part only (the pager stays put while switching)
    const bodyReveals = () => detailRef.current.querySelectorAll(".work-detail__body [data-reveal]");

    // Restores exactly what it found: the preloader may hold its own
    // Lenis stop / overflow lock across this, and must keep it.
    let saved = null;
    const lockScroll = () => {
      const html = document.documentElement;
      const lenis = lenisStore.instance;
      saved = { lenis, lenisStopped: !!lenis?.isStopped, overflow: html.style.overflow, gutter: html.style.scrollbarGutter };
      lenis?.stop();
      html.style.scrollbarGutter = "stable";
      html.style.overflow = "hidden";
    };
    const unlockScroll = () => {
      if (!saved) return;
      const html = document.documentElement;
      html.style.overflow = saved.overflow;
      html.style.scrollbarGutter = saved.gutter;
      if (!saved.lenisStopped) saved.lenis?.start();
      saved = null;
    };

    // Positions the DOM copy: `corners` in viewport px, radius in the
    // copy's own (final-size) px, so it scales with the transform.
    const place = (corners, radius) => {
      const media = mediaRef.current;
      state.corners = corners;
      state.radius = radius;
      media.style.transform = quadMatrix(state.box.width, state.box.height, corners);
      media.style.borderRadius = `${radius}px`;
    };

    const measureFrame = () => {
      const rect = frameRef.current.getBoundingClientRect();
      state.box = rect;
      const media = mediaRef.current;
      media.style.width = `${rect.width}px`;
      media.style.height = `${rect.height}px`;
      return rect;
    };

    const finishClose = () => {
      const carousel = carouselRef.current;
      carousel?.setHiddenCard(-1);
      // two frames: the plane is drawn again before its copy goes away
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (state.phase !== "closing") return;
        mediaRef.current.style.visibility = "hidden";
        gsap.set(bgRef.current, { opacity: 0 });
        state.phase = "idle";
        state.tl = null;
        setIsOpen(false);
        carousel?.hold(false);
        unlockScroll();
        containerRef.current?.focus({ preventScroll: true });
      }));
    };

    async function open({ cardIndex, itemIndex, item }) {
      const carousel = carouselRef.current;
      if (state.phase !== "idle" || !carousel) return;
      const token = ++state.token;
      state.phase = "opening";
      state.cardIndex = cardIndex;
      state.itemIndex = itemIndex;
      carousel.hold(true);
      lockScroll();

      detailRef.current.style.setProperty("--work-card-aspect", carousel.getCardAspect().toFixed(4));
      flushSync(() => {
        setActiveIndex(itemIndex);
        setIsOpen(true);
      });

      // Already in the cache from the ring's texture; decode so the copy
      // never shows up blank on its first frame.
      const image = imageRef.current;
      image.src = item.src;
      try {
        await image.decode();
      } catch {
        // fall through: a broken image still flies, just empty
      }
      if (token !== state.token || state.phase !== "opening") return;

      const box = measureFrame();
      const target = rectQuad(box);
      const from = carousel.getCardQuad(cardIndex) ?? scaleQuad(target, 0.6);
      const startRadius = box.width * CARD_RADIUS;
      const media = mediaRef.current;
      const items = reveals();
      const reduced = reducedMotion();

      gsap.set(items, { opacity: 0, y: reduced ? 0 : 28 });
      gsap.set(closeRef.current, { opacity: 0, scale: reduced ? 1 : 0.85 });
      media.style.visibility = "visible";
      closeRef.current.focus({ preventScroll: true });

      const tl = gsap.timeline({
        onComplete: () => {
          state.phase = "open";
          state.tl = null;
          carousel.setSuspended(true); // fully covered: stop drawing the ring
        },
      });
      state.tl = tl;

      if (reduced) {
        place(target, FINAL_RADIUS);
        carousel.setHiddenCard(cardIndex);
        tl.fromTo(media, { opacity: 0 }, { opacity: 1, boxShadow: SHADOW, duration: 0.3, ease: "none" }, 0)
          .to(bgRef.current, { opacity: 1, duration: 0.3, ease: "none" }, 0)
          .to(items, { opacity: 1, duration: 0.3, ease: "none" }, 0.15)
          .to(closeRef.current, { opacity: 1, duration: 0.3, ease: "none" }, 0.15);
        return;
      }

      place(from, startRadius);
      gsap.set(media, { opacity: 1, boxShadow: NO_SHADOW });
      carousel.setHiddenCard(cardIndex);

      // lift (grow in place) and travel are separate tweens composed each
      // frame, so the image starts swelling before it starts moving and
      // the two blend instead of running back to back
      const motion = { lift: 0, travel: 0 };
      const update = () => {
        place(
          lerpQuad(scaleQuad(from, 1 + LIFT * motion.lift), target, motion.travel),
          lerp(startRadius, FINAL_RADIUS, motion.travel),
        );
      };
      tl.to(motion, { lift: 1, duration: 0.45, ease: "power2.out", onUpdate: update }, 0)
        .to(motion, { travel: 1, duration: 1.0, ease: "power3.inOut", onUpdate: update }, 0.12)
        .to(bgRef.current, { opacity: 1, duration: 0.85, ease: "power2.inOut" }, 0)
        .to(media, { boxShadow: SHADOW, duration: 0.6, ease: "power2.out" }, 0.55)
        .to(items, { opacity: 1, y: 0, duration: 0.75, ease: "power3.out", stagger: 0.06 }, 0.72)
        .to(closeRef.current, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }, 0.8);
    }

    function close() {
      const carousel = carouselRef.current;
      if (state.phase !== "opening" && state.phase !== "open") return;
      if (state.switching) {
        state.pendingClose = true;
        return;
      }
      state.tl?.kill();
      gsap.killTweensOf(reveals());
      state.token++;
      carousel?.setSuspended(false);

      // closed while the image was still decoding: nothing has moved yet
      if (!state.corners || mediaRef.current.style.visibility !== "visible") {
        state.phase = "closing";
        finishClose();
        return;
      }
      state.phase = "closing";

      const media = mediaRef.current;
      const items = reveals();
      const cardIndex = carousel ? carousel.cardForItem(state.itemIndex, state.cardIndex) : -1;
      if (carousel && cardIndex !== state.cardIndex) carousel.setHiddenCard(cardIndex);
      state.cardIndex = cardIndex;
      const to = cardIndex >= 0 ? carousel.getCardQuad(cardIndex) : null;
      const from = state.corners;
      const fromRadius = state.radius;
      const endRadius = state.box.width * CARD_RADIUS;
      const tl = gsap.timeline({ onComplete: finishClose });
      state.tl = tl;

      if (reducedMotion() || !to) {
        // no path back (or no motion wanted): the plane reappears under a fade
        carousel?.setHiddenCard(-1);
        tl.to([...items, closeRef.current], { opacity: 0, duration: 0.25, ease: "none" }, 0)
          .to(media, { opacity: 0, duration: 0.3, ease: "none" }, 0)
          .to(bgRef.current, { opacity: 0, duration: 0.35, ease: "none" }, 0.05);
        return;
      }

      const motion = { travel: 0 };
      tl.to(items, { opacity: 0, y: -14, duration: 0.35, ease: "power2.in", stagger: 0.025 }, 0)
        .to(closeRef.current, { opacity: 0, scale: 0.85, duration: 0.3, ease: "power2.in" }, 0)
        .to(media, { boxShadow: NO_SHADOW, duration: 0.4, ease: "power2.in" }, 0.1)
        .to(motion, {
          travel: 1,
          duration: 0.95,
          ease: "power3.inOut",
          onUpdate: () => place(lerpQuad(from, to, motion.travel), lerp(fromRadius, endRadius, motion.travel)),
        }, 0.15)
        .to(bgRef.current, { opacity: 0, duration: 0.75, ease: "power2.inOut" }, 0.3);
    }

    // Prev / next inside the open view: the next image wipes across the
    // current one in the direction of travel while the text swaps, so the
    // frame never empties. The ring plane hidden behind the view follows
    // the shown project, so closing still flies it home to a matching plane.
    async function go(step) {
      if (state.phase !== "open" || state.switching) return;
      const carousel = carouselRef.current;
      const count = workSlides.length;
      const next = (state.itemIndex + step + count) % count;
      const token = state.token;
      const image = imageRef.current;
      const incoming = incomingRef.current;
      state.switching = true;

      incoming.src = workSlides[next].src;
      try {
        await incoming.decode();
      } catch {
        // swap anyway: the text still has to follow
      }
      if (token !== state.token || state.phase !== "open") {
        state.switching = false;
        return;
      }

      const reduced = reducedMotion();
      const commit = () => {
        flushSync(() => setActiveIndex(next));
        state.itemIndex = next;
        state.cardIndex = carousel ? carousel.cardForItem(next) : -1;
        carousel?.setHiddenCard(state.cardIndex);
        gsap.set(bodyReveals(), { opacity: 0, y: reduced ? 0 : 22 });
      };
      const revealBody = () => gsap.to(bodyReveals(), reduced
        ? { opacity: 1, duration: 0.3, ease: "none" }
        : { opacity: 1, y: 0, duration: 0.65, ease: "power3.out", stagger: 0.05 });

      const tl = gsap.timeline({
        onComplete: async () => {
          // promote the incoming image, then retire the top layer
          image.src = incoming.src;
          try {
            await image.decode();
          } catch {
            // nothing to wait for
          }
          gsap.set(image, { clearProps: "transform" });
          gsap.set(incoming, { visibility: "hidden" });
          state.switching = false;
          if (state.pendingClose) {
            state.pendingClose = false;
            close();
          }
        },
      });

      if (reduced) {
        gsap.set(incoming, { visibility: "visible", clipPath: "inset(0% 0% 0% 0%)", opacity: 0, scale: 1 });
        tl.to(bodyReveals(), { opacity: 0, duration: 0.2, ease: "none" }, 0)
          .to(incoming, { opacity: 1, duration: 0.3, ease: "none" }, 0)
          .add(commit, 0.2)
          .add(revealBody, 0.22);
        return;
      }

      gsap.set(incoming, {
        visibility: "visible",
        opacity: 1,
        scale: 1.08,
        clipPath: step > 0 ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)",
      });
      tl.to(bodyReveals(), { opacity: 0, y: -12, duration: 0.3, ease: "power2.in", stagger: 0.02 }, 0)
        .to(incoming, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power3.inOut" }, 0)
        .to(incoming, { scale: 1, duration: 1.1, ease: "power3.out" }, 0)
        .to(image, { scale: 1.06, xPercent: -5 * step, duration: 0.9, ease: "power3.inOut" }, 0)
        .add(commit, 0.38)
        .add(revealBody, 0.4);
    }

    // Keep the landed image locked to its frame through resizes.
    function onResize() {
      if (state.phase !== "open") return;
      const box = measureFrame();
      place(rectQuad(box), FINAL_RADIUS);
    }

    function onKeyDown(e) {
      if (state.phase !== "opening" && state.phase !== "open") return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (state.phase === "open" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      // keep Tab inside the dialog
      if (e.key === "Tab") {
        const focusable = [...detailRef.current.querySelectorAll("button, a[href]")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!detailRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    handlers.current = { open, close, go };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      state.tl?.kill();
      if (state.phase !== "idle") unlockScroll();
      state.phase = "idle";
    };
  }, []);

  const close = () => handlers.current.close?.();
  const go = (step) => handlers.current.go?.(step);
  const count = workSlides.length;
  const prevProject = project ? workSlides[(activeIndex - 1 + count) % count] : null;
  const nextProject = project ? workSlides[(activeIndex + 1) % count] : null;

  return (
    <section className="slider">
      <div
        className="carousel"
        ref={containerRef}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label="Work - press Enter to open the front project"
        aria-keyshortcuts="ArrowLeft ArrowRight Enter"
      />

      {isClient && createPortal(
        <div
          className={`work-detail${isOpen ? " is-open" : ""}`}
          ref={detailRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="work-detail-title"
          aria-hidden={!isOpen}
          inert={!isOpen}
        >
          <div className="work-detail__bg" ref={bgRef} />

          <div className="work-detail__media" ref={mediaRef} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- the copy
                must be the exact, already-cached texture source, unresized */}
            <img ref={imageRef} alt="" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img ref={incomingRef} className="work-detail__incoming" alt="" draggable={false} />
          </div>

          <div className="work-detail__layout">
            <div className="work-detail__info" data-lenis-prevent>
              {project && (
                <>
                  <div className="work-detail__body">
                    <p className="work-detail__eyebrow" data-reveal>
                      <span>Selected work</span>
                      <span>
                        {String(activeIndex + 1).padStart(2, "0")} / {String(workSlides.length).padStart(2, "0")}
                      </span>
                    </p>
                    <p className="work-detail__category" data-reveal>{project.category}</p>
                    <h2 className="work-detail__title" id="work-detail-title" data-reveal>{project.title}</h2>
                    {project.client && (
                      <p className="work-detail__client" data-reveal>
                        <em>for</em> {project.client}
                      </p>
                    )}
                    <p className="work-detail__description" data-reveal>{project.description}</p>
                    <dl className="work-detail__meta" data-reveal>
                      {project.client && (
                        <div>
                          <dt>Client</dt>
                          <dd>{project.client}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Discipline</dt>
                        <dd>{project.category}</dd>
                      </div>
                      <div>
                        <dt>Deliverables</dt>
                        <dd>{project.deliverables.join(", ")}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="work-detail__pager" role="group" aria-label="More projects" data-reveal>
                    <button
                      type="button"
                      className="work-detail__step"
                      onClick={() => go(-1)}
                      aria-label={`Previous project: ${prevProject.title}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M19 12H5M11 6l-6 6 6 6" />
                      </svg>
                      <span>Prev</span>
                    </button>
                    <span className="work-detail__pager-rule" aria-hidden="true" />
                    <button
                      type="button"
                      className="work-detail__step"
                      onClick={() => go(1)}
                      aria-label={`Next project: ${nextProject.title}`}
                    >
                      <span>Next</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* the image's final box: measured, never painted */}
            <div className="work-detail__frame" ref={frameRef} aria-hidden="true" />
          </div>

          <button
            type="button"
            className="work-detail__close"
            ref={closeRef}
            onClick={close}
            aria-label="Close project details"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </section>
  );
}
