"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { WORK_PAGE_IMAGES, WORK_PAGE_PROJECTS } from "@/data/workPageProjects";

gsap.registerPlugin(Draggable, InertiaPlugin);

// Same infinite-drag slider mechanics as the homepage's Work section
// (Work.jsx), kept as a separate component with its own images/project
// data rather than modifying that one - see src/components/Work.jsx for
// the original this was mirrored from.
const IMAGES = WORK_PAGE_IMAGES;

const SET_COUNT = 3;
const TRACK_LERP = 0.12;
const SETTLE_EPSILON = 0.05;
const PARALLAX_MAX = 8;
const PARALLAX_STRENGTH = 0.14;
const PARALLAX_OVERSCAN_SCALE = 1.3;

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

  gsap.set(slideImages, { scale: PARALLAX_OVERSCAN_SCALE, transformOrigin: "50% 50%" });

  let loopWidth = 0;
  const measure = () => {
    loopWidth = slides[perSet].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
  };
  measure();

  const proxy = document.createElement("div");
  proxy.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(proxy);

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
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measure();
      gsap.set(track, { x: gsap.utils.wrap(-loopWidth, 0, currentX) });
    }, 150);
  };
  window.addEventListener("resize", onResize);

  return () => {
    window.removeEventListener("resize", onResize);
    gsap.ticker.remove(renderFrame);
    draggable.kill();
    proxy.remove();
  };
}

export default function WorkGallery() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!IMAGES.length) return;

    const container = containerRef.current;
    const cleanups = [];

    container.querySelectorAll(".sliders").forEach((viewport) => {
      const track = viewport.querySelector(".slider-track");
      if (track) cleanups.push(initInfiniteSlider(viewport, track, IMAGES));
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return (
    <div className="work-gallery-page" ref={containerRef}>
      <h2 className="work-title">Our Work</h2>

      {WORK_PAGE_PROJECTS.map((project) => (
        <div className="row" key={project.index}>
          <div className="sliders">
            <div className="slider-track"></div>
          </div>

          <div className="content">
            <h2>{project.index}</h2>
            <h2>
              {project.name} <span>({project.category})</span>
            </h2>
            <h2>{project.team}</h2>
          </div>
        </div>
      ))}
    </div>
  );
}
