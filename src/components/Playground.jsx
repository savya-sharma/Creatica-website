"use client";

import { useEffect, useRef, useState } from "react";
import { onLenisReady } from "@/lib/lenis";

const CAROUSEL_IMAGES = [
  "/ProjectsImg/ASSET1.webp",
  "/ProjectsImg/ASSET2.webp",
  "/ProjectsImg/ASSET3.webp",
  "/ProjectsImg/ASSET4.webp",
  "/ProjectsImg/ASSET5.webp",
  "/ProjectsImg/ASSET6.webp",
  "/ProjectsImg/ASSET7.webp",
  "/ProjectsImg/ASSET8.webp",
  "/ProjectsImg/ASSET9.webp",
  "/ProjectsImg/ASSET10.webp",
  "/ProjectsImg/ASSET11.webp",
  "/ProjectsImg/ASSET12.webp",
];

// index-for-index with CAROUSEL_IMAGES - first title belongs to the first
// image, second to the second, and so on
const CAROUSEL_TITLES = [
  "Silent Bloom",
  "Tin Vessel",
  "Iris Study",
  "The Observer",
  "Soft Static",
  "Blue Descent",
  "Still Life No.7",
  "Nape",
  "Voltage",
  "Distant Wall",
  "Quiet Grain",
  "Last Light",
];

const TOTAL_SLIDES = CAROUSEL_IMAGES.length;
// the gap between each slide around the ring
const ANGLE_BETWEEN_SLIDES = 360 / TOTAL_SLIDES;

// the desktop composition's reference values - .orbit-ring is 180px wide
// there (see playground.css), with the orbit radius and perspective tuned
// to match it. Below the tablet breakpoint the ring's CSS width shrinks
// fluidly (clamp() based on viewport size, not a fixed breakpoint value),
// so the radius/perspective below scale by the exact same ratio the ring
// itself shrank by - the 3D effect's proportions stay identical, just
// smaller, instead of the orbit staying desktop-sized while its container
// shrinks around it (which is what was pushing the carousel to overflow/
// crop on narrow screens)
const DESKTOP_RING_WIDTH = 180;
const DESKTOP_ORBIT_RADIUS = 720;
const DESKTOP_PERSPECTIVE = 2000;

const WHEEL_SENSITIVITY = 0.2;
const MAX_TILT = 30;
// glide on scroll rather than snap - a small lerp toward the wheel-driven
// target each frame instead of jumping straight to it
const SMOOTHING = 0.05;

// matches the sitewide tablet breakpoint - desktop (above this) keeps the
// wheel-only interaction exactly as-is, autoplay never runs there
const AUTOPLAY_BREAKPOINT = "(max-width: 1000px)";
const AUTOPLAY_INTERVAL = 3000; // ~3s between auto-advanced slides
// how long to wait after the user's last wheel/touch input before autoplay
// picks back up - long enough that it never fights an in-progress gesture
const AUTOPLAY_RESUME_DELAY = 2000;

// drag-to-rotate (tablet/mobile only, same breakpoint as autoplay above) -
// degrees of rotation per pixel of horizontal finger movement
const DRAG_SENSITIVITY = 0.35;
// scales the release velocity (deg/ms) into a coasting target rotation -
// the existing SMOOTHING lerp in animate() eases toward that target every
// frame, which is what actually produces the decelerating "coast" feel
const FLING_MULTIPLIER = 14;

const lerp = (from, to, amount) => from + (to - from) * amount;

export default function Playground() {
  const sliderRef = useRef(null);
  const stageRef = useRef(null);
  const orbitRef = useRef(null);
  const previewRef = useRef(null);
  const previewImgRef = useRef(null);
  const titleRef = useRef(null);
  // defaults to the desktop value so the very first render (before the
  // ResizeObserver below can measure the actual rendered ring) matches
  // desktop exactly - it only ever gets smaller from here, and only on
  // screens where the ring's own CSS width has already shrunk
  const [orbitRadius, setOrbitRadius] = useState(DESKTOP_ORBIT_RADIUS);

  useEffect(() => {
    const slider = sliderRef.current;
    const stage = stageRef.current;
    const orbit = orbitRef.current;
    const previewBox = previewRef.current;
    const previewImg = previewImgRef.current;
    const title = titleRef.current;
    if (!slider || !stage || !orbit || !previewBox) return;

    let isIntersecting = false;
    let frameId = null;

    let targetRotation = 0;
    let currentRotation = 0;

    // autoplay (tablet/mobile only) - nudges targetRotation by exactly one
    // slide every AUTOPLAY_INTERVAL and lets the *existing* lerp in
    // animate() below ease currentRotation toward it, same as a wheel
    // input would - no separate transition/easing logic needed
    const autoplayQuery = window.matchMedia(AUTOPLAY_BREAKPOINT);
    let isTabletOrMobile = autoplayQuery.matches;
    let isUserInteracting = false;
    let autoplayTimer = null;
    let resumeTimer = null;

    function startAutoplay() {
      if (autoplayTimer !== null) return; // never run two timers at once
      autoplayTimer = setInterval(() => {
        targetRotation -= ANGLE_BETWEEN_SLIDES;
      }, AUTOPLAY_INTERVAL);
    }

    function stopAutoplay() {
      if (autoplayTimer !== null) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    function syncAutoplay() {
      if (isTabletOrMobile && isIntersecting && !isUserInteracting) {
        startAutoplay();
      } else {
        stopAutoplay();
      }
    }

    // called from any manual input (wheel or touch) - pauses immediately
    // and queues a resume once the user's been idle for a moment, so
    // autoplay never fights an in-progress gesture or snaps back the
    // instant a finger lifts
    function pauseForInteraction() {
      isUserInteracting = true;
      if (resumeTimer !== null) clearTimeout(resumeTimer);
      syncAutoplay();

      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        isUserInteracting = false;
        syncAutoplay();
      }, AUTOPLAY_RESUME_DELAY);
    }

    function handleAutoplayBreakpointChange(e) {
      isTabletOrMobile = e.matches;
      syncAutoplay();
    }

    autoplayQuery.addEventListener("change", handleAutoplayBreakpointChange);

    // only rotates the ring while this section is actually on screen, so
    // scrolling elsewhere on the site can never spin it in the background
    function handleWheel(e) {
      if (!isIntersecting) return;
      targetRotation -= e.deltaY * WHEEL_SENSITIVITY;
      pauseForInteraction();
    }

    window.addEventListener("wheel", handleWheel, { passive: true });

    // drag-to-rotate (tablet/mobile only) - reuses targetRotation/
    // currentRotation and the SMOOTHING lerp in animate() below exactly as
    // wheel input does, just fed from a finger instead of a wheel delta.
    // While actively dragging, target and current are set together for
    // direct 1:1 tracking (the ring should stick to the finger, not lag
    // behind it); releasing projects a coasting target from the recent
    // drag velocity, handing off to the same lerp for the deceleration
    let lenisInstance = null;
    const cleanupLenisReady = onLenisReady((lenis) => {
      lenisInstance = lenis;
    });

    let isDragging = false;
    let dragStartX = 0;
    let dragStartRotation = 0;
    let lastDragX = 0;
    let lastDragTime = 0;
    let dragVelocity = 0; // degrees per ms, smoothed across move events

    function handleTouchStart(e) {
      if (!isIntersecting) return;
      pauseForInteraction();

      // desktop's interaction stays wheel-only - a touchscreen laptop
      // touching the carousel there shouldn't start a drag
      if (!isTabletOrMobile) return;

      isDragging = true;
      const touch = e.touches[0];
      dragStartX = touch.clientX;
      dragStartRotation = targetRotation;
      lastDragX = touch.clientX;
      lastDragTime = performance.now();
      dragVelocity = 0;

      // the carousel is a viewport-locked interaction section on mobile -
      // the page must not scroll vertically (or at all) while a drag is
      // in progress, only the ring should respond to the finger
      lenisInstance?.stop();
    }

    function handleTouchMove(e) {
      if (!isDragging) return;
      // blocks the browser's own touch-scroll/pan so a horizontal (or
      // even slightly vertical) finger movement can never leak into a
      // page scroll while dragging the carousel - requires this listener
      // to be non-passive (see addEventListener below)
      e.preventDefault();

      const touch = e.touches[0];
      const rotation =
        dragStartRotation + (touch.clientX - dragStartX) * DRAG_SENSITIVITY;
      targetRotation = rotation;
      currentRotation = rotation;

      const now = performance.now();
      const dt = now - lastDragTime;
      if (dt > 0) {
        const instantVelocity =
          ((touch.clientX - lastDragX) * DRAG_SENSITIVITY) / dt;
        // smoothed rather than taken raw, so one jittery sample right
        // before release can't fling the ring wildly off-course
        dragVelocity = lerp(dragVelocity, instantVelocity, 0.5);
      }
      lastDragX = touch.clientX;
      lastDragTime = now;
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;

      // projects where the flick would naturally coast to - the existing
      // per-frame SMOOTHING lerp eases currentRotation toward this target,
      // which is exactly what makes it decelerate smoothly to a stop
      // instead of snapping dead the instant the finger lifts
      targetRotation = currentRotation + dragVelocity * FLING_MULTIPLIER;

      lenisInstance?.start();
      pauseForInteraction();
    }

    slider.addEventListener("touchstart", handleTouchStart, { passive: true });
    // non-passive - handleTouchMove calls preventDefault() to block page
    // scroll during a drag, which a passive listener can't do
    slider.addEventListener("touchmove", handleTouchMove, { passive: false });
    slider.addEventListener("touchend", endDrag);
    // a drag interrupted by e.g. an incoming call or the OS's own
    // back-swipe gesture still needs to resume Lenis and clear isDragging,
    // or the page would stay scroll-locked indefinitely
    slider.addEventListener("touchcancel", endDrag);

    // takes the current rotation, divides by the angle between slides, and
    // rounds it to find which slide is currently front-and-center
    let shownIndex = 0;
    function showActiveSlide() {
      const steps = Math.round(-currentRotation / ANGLE_BETWEEN_SLIDES);
      const nextIndex = ((steps % TOTAL_SLIDES) + TOTAL_SLIDES) % TOTAL_SLIDES;

      if (nextIndex === shownIndex) return;
      shownIndex = nextIndex;

      // a fast fling can cross several slides in a single frame, so this
      // can fire on nearly every rAF tick during quick scrolling - going
      // through React state/re-render for what's just a src and text swap
      // was the actual source of the fast-scroll jank, so these write
      // straight to the DOM via refs instead
      if (previewImg) previewImg.src = CAROUSEL_IMAGES[nextIndex];
      if (title) title.textContent = CAROUSEL_TITLES[nextIndex];
    }

    // parallax tilt - the ring leans slightly toward the cursor
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    function handleMouseMove(e) {
      const distanceFromCenterX = e.clientX / window.innerWidth - 0.5;
      const distanceFromCenterY = e.clientY / window.innerHeight - 0.5;
      targetTiltY = distanceFromCenterX * MAX_TILT;
      targetTiltX = -distanceFromCenterY * MAX_TILT;
    }

    function handleMouseLeave() {
      targetTiltX = 0;
      targetTiltY = 0;
    }

    slider.addEventListener("mousemove", handleMouseMove);
    slider.addEventListener("mouseleave", handleMouseLeave);

    function updateTilt() {
      currentTiltX = lerp(currentTiltX, targetTiltX, SMOOTHING);
      currentTiltY = lerp(currentTiltY, targetTiltY, SMOOTHING);
      stage.style.transform = `rotateX(${currentTiltX}deg) rotateY(${currentTiltY}deg)`;
    }

    function animate() {
      frameId = requestAnimationFrame(animate);

      currentRotation = lerp(currentRotation, targetRotation, SMOOTHING);
      orbit.style.transform = `translate(-50%, -50%) rotateY(${currentRotation}deg)`;
      // fixed the original reference's "traslate" typo here
      // the preview stays fixed - it only ever swaps which image it shows
      // (via showActiveSlide below), it doesn't spin with the ring

      showActiveSlide();
      updateTilt();
    }

    animate();

    // keeps the 3D orbit radius and perspective in lockstep with however
    // big the ring's CSS (aspect-ratio + clamp(), see playground.css)
    // actually renders it at the current viewport - reading the real
    // rendered size rather than re-deriving it from breakpoint numbers
    // means this stays correct for any width/height, not just the couple
    // of sizes it happened to be tested at
    function syncOrbitScale() {
      const ringWidth = orbit.clientWidth;
      if (!ringWidth) return;

      const scale = ringWidth / DESKTOP_RING_WIDTH;
      setOrbitRadius(DESKTOP_ORBIT_RADIUS * scale);
      slider.style.perspective = `${DESKTOP_PERSPECTIVE * scale}px`;
    }

    syncOrbitScale();
    const orbitResizeObserver = new ResizeObserver(syncOrbitScale);
    orbitResizeObserver.observe(orbit);

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting;
        syncAutoplay();
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(slider);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      stopAutoplay();
      if (resumeTimer !== null) clearTimeout(resumeTimer);
      // unmounting mid-drag must not leave the shared Lenis instance
      // stopped for the rest of the site
      if (isDragging) lenisInstance?.start();
      cleanupLenisReady();
      autoplayQuery.removeEventListener("change", handleAutoplayBreakpointChange);
      window.removeEventListener("wheel", handleWheel);
      slider.removeEventListener("touchstart", handleTouchStart);
      slider.removeEventListener("touchmove", handleTouchMove);
      slider.removeEventListener("touchend", endDrag);
      slider.removeEventListener("touchcancel", endDrag);
      slider.removeEventListener("mousemove", handleMouseMove);
      slider.removeEventListener("mouseleave", handleMouseLeave);
      orbitResizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, []);

  return (
    <div className="playground-page">
      <section className="orbit-slider" ref={sliderRef}>
        <div className="orbit-stage" ref={stageRef}>
          <div className="orbit-preview" ref={previewRef}>
            <img
              className="orbit-preview-img"
              ref={previewImgRef}
              src={CAROUSEL_IMAGES[0]}
              decoding="async"
              alt=""
            />
          </div>

          <div className="orbit-ring" ref={orbitRef}>
            {CAROUSEL_IMAGES.map((src, index) => (
              <div
                className="orbit-panel"
                key={src}
                style={{
                  transform: `rotateY(${
                    index * ANGLE_BETWEEN_SLIDES
                  }deg) translateZ(${orbitRadius}px)`,
                }}
              >
                <img src={src} alt="" />
              </div>
            ))}
          </div>
        </div>

        <div className="orbit-title" ref={titleRef}>
          {CAROUSEL_TITLES[0]}
        </div>
      </section>
    </div>
  );
}
