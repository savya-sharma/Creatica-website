"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { SLIDER_IMAGES } from "@/data/sliderImages";

gsap.registerPlugin(Draggable, InertiaPlugin);

// Next.js has no Vite-style build-time directory scan, so SLIDER_IMAGES is a
// hand-maintained list in src/data/sliderImages.js instead of being generated
// from a scan of public/images.
const IMAGES = SLIDER_IMAGES;

const SET_COUNT = 3; // duplicate sets either side of center give a wrap buffer
const TRACK_LERP = 0.12; // how quickly the rendered track catches up to the drag target
const SETTLE_EPSILON = 0.05; // px lag below which we snap to target and can pause the ticker
const PARALLAX_MAX = 8; // xPercent, kept inside the image's 15% overflow buffer
const PARALLAX_STRENGTH = 0.14;
const PARALLAX_OVERSCAN_SCALE = 1.3; // scales the image 15% past each edge (symmetric,
// unlike an asymmetric width/left percentage pairing) so the ±8 xPercent parallax
// shift never exposes the .slide-img container underneath, in either direction

function buildSlideSet(images) {
  const fragment = document.createDocumentFragment();
  images.forEach((src) => {
    const slide = document.createElement("div");
    slide.className = "slide-img";

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;

    slide.appendChild(img);
    fragment.appendChild(slide);
  });
  return fragment;
}

function initInfiniteSlider(viewport, track, images) {
  for (let i = 0; i < SET_COUNT; i++) {
    track.appendChild(buildSlideSet(images));
  }

  const slides = Array.from(track.querySelectorAll(".slide-img"));
  const slideImages = slides.map((slide) => slide.querySelector("img"));
  const perSet = images.length;

  // static overscan so the image always fully covers its clipped .slide-img
  // box - done via a centered scale (symmetric by construction) rather than
  // an asymmetric width/left percentage pairing, which is what previously
  // let a strip of the container's background show through on one side
  gsap.set(slideImages, { scale: PARALLAX_OVERSCAN_SCALE, transformOrigin: "50% 50%" });

  let loopWidth = 0;
  const measure = () => {
    // getBoundingClientRect gives sub-pixel precision, unlike offsetLeft
    // (always rounded to an integer) - any transform on track cancels out
    // of the subtraction since both slides share it, so this stays accurate
    // to the true flex-computed set width (widths + gaps) even mid-drag.
    // A rounded loopWidth would make only the wrap-seam gap look off,
    // since every other gap is laid out natively by flexbox at full
    // precision and only the seam is stitched together using this value.
    loopWidth = slides[perSet].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
  };
  measure();

  // Draggable recomputes x from a fixed start position captured on press, so
  // manually wrapping the dragged element's own x gets clobbered on the very
  // next pointer move. Instead we drag an invisible, unbounded proxy and
  // derive the visible track's position from it every frame - the proxy's
  // own physics/inertia are never touched, so nothing fights it.
  const proxy = document.createElement("div");
  proxy.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(proxy);

  // currentX lerps toward the proxy's raw (unbounded) x every frame, giving
  // the drag a smoothed, buttery follow on top of InertiaPlugin's own easing.
  // Wrapping is applied only at render time, after lerping, in continuous
  // (unbounded) space - so the loop point never appears as a jump.
  let currentX = 0;
  let tickerActive = false;

  const renderFrame = () => {
    const targetX = draggable.x;
    const lag = targetX - currentX;

    if (Math.abs(lag) < SETTLE_EPSILON && !draggable.isPressed && !draggable.tween) {
      currentX = targetX;
      gsap.set(track, { x: gsap.utils.wrap(-loopWidth, 0, currentX) });
      gsap.set(slideImages, { xPercent: 0 });
      gsap.ticker.remove(renderFrame);
      tickerActive = false;
      return;
    }

    currentX += lag * TRACK_LERP;
    gsap.set(track, { x: gsap.utils.wrap(-loopWidth, 0, currentX) });

    const shift = gsap.utils.clamp(-PARALLAX_MAX, PARALLAX_MAX, lag * PARALLAX_STRENGTH);
    gsap.set(slideImages, { xPercent: shift });
  };

  const ensureTicking = () => {
    if (!tickerActive) {
      tickerActive = true;
      gsap.ticker.add(renderFrame);
    }
  };

  const draggable = Draggable.create(proxy, {
    type: "x",
    trigger: viewport,
    inertia: true,
    allowNativeTouchScrolling: false,
    onPress() {
      viewport.classList.add("is-dragging");
      ensureTicking();
    },
    onDrag: ensureTicking,
    onThrowUpdate: ensureTicking,
    onRelease() {
      viewport.classList.remove("is-dragging");
    },
  })[0];

  currentX = draggable.x;
  gsap.set(track, { x: gsap.utils.wrap(-loopWidth, 0, currentX) });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measure();
      gsap.set(track, { x: gsap.utils.wrap(-loopWidth, 0, currentX) });
    }, 150);
  });
}

export default function Work() {
  useEffect(() => {
    if (!IMAGES.length) return;

    document.querySelectorAll(".sliders").forEach((viewport) => {
      const track = viewport.querySelector(".slider-track");
      if (track) initInfiniteSlider(viewport, track, IMAGES);
    });
  }, []);

  return (
    <>
      <h2 className="work-title">Selected Projects</h2>

      <div className="row">
        <div className="sliders">
          <div className="slider-track"></div>
        </div>

        <div className="content">
          <h2>01</h2>
          <h2>
            Website <span>(Business)</span>
          </h2>
          <h2>Team of 2</h2>
        </div>
      </div>

      <div className="row">
        <div className="sliders">
          <div className="slider-track"></div>
        </div>

        <div className="content">
          <h2>02</h2>
          <h2>
            App <span>(Mobile)</span>
          </h2>
          <h2>Team of 3</h2>
        </div>
      </div>

      <div className="row">
        <div className="sliders">
          <div className="slider-track"></div>
        </div>

        <div className="content">
          <h2>03</h2>
          <h2>
            Branding <span>(Identity)</span>
          </h2>
          <h2>Team of 4</h2>
        </div>
      </div>
    </>
  );
}
