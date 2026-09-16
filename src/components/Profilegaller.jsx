"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

const SLIDE_WIDTH = 200;
const SLIDE_HEIGHT = 275;
const SLIDE_GAP = 100;
const SLIDE_COUNT = 9;
const ARC_DEPTH = 200;
const CENTER_LIFT = 100;
const SCROLL_LERP = 0.02;
const AUTO_SPEED = 40; // px/sec the track advances on its own

// below 400px viewport width, every size/spacing constant above shrinks
// together by the same factor - the arc's proportions and motion stay
// identical, just smaller, instead of the fixed 200px-wide desktop slides
// overflowing/cramming on a phone. At 400px and up this is exactly 1, so
// desktop and tablet are completely unaffected.
const MOBILE_BREAKPOINT = 400;
const MIN_SIZE_SCALE = 0.55;
function getSizeScale(viewportWidth) {
  return Math.min(1, Math.max(MIN_SIZE_SCALE, viewportWidth / MOBILE_BREAKPOINT));
}

// -opt versions: the originals were full camera-resolution exports (up to
// 4284x5712, several MB each) being displayed at a max of ~200x275 CSS px -
// see scripts/optimize-gallery-images.mjs, which resized these down to a
// ~900px longer edge at quality 82 (12.4MB -> 0.59MB total across all 9,
// visually the same at the size they're actually shown at).
const slideSources = [
  "/GalleryImg/img1-opt.webp",
  "/GalleryImg/img2-opt.webp",
  "/GalleryImg/img3-opt.webp",
  "/GalleryImg/img4-opt.webp",
  "/GalleryImg/img5-opt.webp",
  "/GalleryImg/img6-opt.webp",
  "/GalleryImg/img7-opt.webp",
  "/GalleryImg/img8-opt.webp",
  "/GalleryImg/img9-opt.webp",
];

const slideTitles = [
  "Profile Study",
  "Pump Noir",
  "Compact Disc",
  "Iris Frame",
  "Open Compact",
  "Shelf Set",
  "Hand Held",
  "Clear Stack",
  "Foam Pump",
];

export default function Profilegallery() {
  const sliderRef = useRef(null);

  useEffect(() => {
    const sliderContainer = sliderRef.current;
    const titleDisplay = sliderContainer.querySelector("#slide-title");

    // calculate the layout values
    let windowWidth = window.innerWidth;
    let windowHeight = window.innerHeight;
    let windowCenterX = windowWidth / 2;
    let arcBaselineY = windowHeight * 0.4;

    let sizeScale = getSizeScale(windowWidth);
    let slideWidth = SLIDE_WIDTH * sizeScale;
    let slideHeight = SLIDE_HEIGHT * sizeScale;
    let slideGap = SLIDE_GAP * sizeScale;
    let arcDepth = ARC_DEPTH * sizeScale;
    let centerLift = CENTER_LIFT * sizeScale;
    let trackWidth = SLIDE_COUNT * slideGap;

    const createdSlides = [];
    slideSources.forEach((src, i) => {
      const slideEl = document.createElement("div");
      slideEl.classList.add("slide");

      const imgEl = document.createElement("img");
      // the gallery section sits well below the fold on the About page, and
      // the arc only ever shows a couple of slides near full size at once -
      // native lazy-loading/async decode lets the browser skip work on the
      // ones that aren't actually on screen yet instead of decoding all 9
      // up front. The first slide (immediately closest to center on mount)
      // stays eager so there's no blank flash before it's visible.
      imgEl.loading = i === 0 ? "eager" : "lazy";
      imgEl.decoding = "async";
      imgEl.src = src;
      slideEl.appendChild(imgEl);

      sliderContainer.appendChild(slideEl);
      createdSlides.push(slideEl);
    });

    const slideElements = gsap.utils.toArray(createdSlides);

    function computeSlideTransform(slideIndex, scrollOffset) {
      let wrappedOffsetX =
        (((slideIndex * slideGap - scrollOffset) % trackWidth) + trackWidth) %
        trackWidth;
      if (wrappedOffsetX > trackWidth / 2) wrappedOffsetX -= trackWidth;

      const slideCenterX = windowCenterX + wrappedOffsetX;
      const normalizedDist = (slideCenterX - windowCenterX) / (windowWidth * 0.5);
      const absDist = Math.min(Math.abs(normalizedDist), 1.3);

      const scaleFactor = Math.max(1 - absDist * 0.8, 0.25);
      const scaledWidth = slideWidth * scaleFactor;
      const scaledHeight = slideHeight * scaleFactor;

      const clampedDist = Math.min(absDist, 1);
      const arcDropY = (1 - Math.cos(clampedDist * Math.PI)) * 0.5 * arcDepth;

      const centerLiftY = Math.max(1 - absDist * 2, 0) * centerLift;

      return {
        x: slideCenterX - scaledWidth / 2,
        y: arcBaselineY - scaledHeight / 2 + arcDropY - centerLiftY,
        width: scaledWidth,
        height: scaledHeight,
        zIndex: Math.round((1 - absDist) * 100),
        distanceFromCenter: Math.abs(wrappedOffsetX),
      };
    }

    function layoutSlides(scrollOffset) {
      slideElements.forEach((slideEl, i) => {
        const { x, y, width, height, zIndex } = computeSlideTransform(
          i,
          scrollOffset
        );

        gsap.set(slideEl, { x, y, width, height, zIndex });
      });
    }

    layoutSlides(0);

    // the track advances on its own, at a constant pace - no wheel/touch
    // interception at all, so this never competes with the page's own
    // scroll (Lenis or otherwise), it just plays in the background
    let scrollTarget = 0;
    let scrollCurrent = 0;

    let activeSlideIndex = -1;

    function syncActiveTitle(scrollOffset) {
      let closestIndex = 0;
      let closestDist = Infinity;

      slideElements.forEach((_, i) => {
        const { distanceFromCenter } = computeSlideTransform(i, scrollOffset);
        if (distanceFromCenter < closestDist) {
          closestDist = distanceFromCenter;
          closestIndex = i;
        }
      });

      if (closestIndex !== activeSlideIndex) {
        activeSlideIndex = closestIndex;
        titleDisplay.textContent = slideTitles[closestIndex];
      }
    }

    let rafId;
    let lastTime = performance.now();
    function animate(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      scrollTarget += AUTO_SPEED * dt;
      scrollCurrent += (scrollTarget - scrollCurrent) * SCROLL_LERP;

      layoutSlides(scrollCurrent);
      syncActiveTitle(scrollCurrent);

      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);

    // resizing
    const onResize = () => {
      windowWidth = window.innerWidth;
      windowHeight = window.innerHeight;
      windowCenterX = windowWidth / 2;
      arcBaselineY = windowHeight * 0.4;

      sizeScale = getSizeScale(windowWidth);
      slideWidth = SLIDE_WIDTH * sizeScale;
      slideHeight = SLIDE_HEIGHT * sizeScale;
      slideGap = SLIDE_GAP * sizeScale;
      arcDepth = ARC_DEPTH * sizeScale;
      centerLift = CENTER_LIFT * sizeScale;
      trackWidth = SLIDE_COUNT * slideGap;
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      createdSlides.forEach((slideEl) => slideEl.remove());
    };
  }, []);

  return (
    <section className="slider" ref={sliderRef}>
      <p id="slide-title">slide Title</p>
    </section>
  );
}
