"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { onLenisReady } from "@/lib/lenis";

const SPOTLIGHT_ITEMS = [
  { src: "/GalleryImg/GAL-1.webp", title: "Fruiting Bodies" },
  { src: "/GalleryImg/GAL-2.webp", title: "Silk & Sediment" },
  { src: "/GalleryImg/GAL-3.webp", title: "Lowland Drift" },
  { src: "/GalleryImg/GAL-4.webp", title: "Canvas Drape" },
  { src: "/GalleryImg/GAL-5.webp", title: "Culture Dish" },
  { src: "/GalleryImg/GAL-6.webp", title: "Amber Hollow" },
];

// the images are "a genuine mix of aspect ratios" (see work-bee.css), so
// spotlight items are NOT evenly spaced down the section - a shorter
// landscape image and a tall portrait one next to it leave very different
// gaps. Guessing touch points as `i / itemCount` (evenly spaced) drifts
// further from each item's *actual* position the more items precede it -
// exactly the "some images reached, others missed, cumulative drift"
// symptom. Measuring each item's real offsetTop/offsetHeight and
// converting that to the exact scroll progress at which its center
// crosses the viewport's own center is the only way every touch point
// stays correct regardless of how tall any given image turns out to be.
//
// progress p in a "top top" -> "bottom bottom" ScrollTrigger means the
// section has been scrolled up by p * (sectionHeight - viewportHeight).
// An item's viewport-relative position at that point is
// (itemCenter - scrolled); solving for the p where that lands on the
// viewport's vertical center gives the item's touch progress.
//
// clamped a small margin inside [0, 1] rather than to the exact edges:
// on a short viewport the first (or last) item's ideal centering point
// can fall just *before* "top top" ever fires (or just *after* "bottom
// bottom") - mathematically before/after the trigger's own tracked range.
// Landing exactly on progress 0 would collide with, and override, the
// dedicated resting position above the intro heading (which must hold
// for the *entire* time progress is pinned at 0, i.e. all the way through
// scrolling past the intro, not just at the literal instant it changes).
//
// the ScrollTrigger driving all this (see the effect below) starts and
// ends this many pixels earlier/later than the section's literal edges
// (start: "top top+=EDGE_BUFFER_PX", end: "bottom bottom+=EDGE_BUFFER_PX")
// specifically so the first and last items' own centers are guaranteed to
// fall *within* the tracked [0, 1] range instead of slightly outside it -
// on a short viewport, an item near the very top/bottom of the section
// can be closer to the section's edge than half a viewport height, which
// means the scroll position where it would sit dead-center in the
// viewport occurs before "top top" (or after "bottom bottom") ever fires.
// Both this and measureTouchProgresses below have to agree on the exact
// same extended range for the math to line up.
const EDGE_BUFFER_PX = 200;

// a thin backstop, not the primary fix - the extended range above should
// make every genuine touch point reachable, but this still guards against
// an item being positioned so close to empty (unlikely, but not
// impossible with editable content) that even EDGE_BUFFER_PX isn't
// enough, so no touch point can ever collide with (and get silently
// overridden by) the progress-0/1 resting and exit keyframes
const TOUCH_MARGIN_PX = 20;

function measureTouchProgresses(section, items, viewportHeight) {
  const scrollableDistance = Math.max(1, section.offsetHeight - viewportHeight);
  const extendedDistance = scrollableDistance + EDGE_BUFFER_PX * 2;
  const margin = gsap.utils.clamp(0, 0.2, TOUCH_MARGIN_PX / extendedDistance);

  return items.map((item) => {
    const itemCenter = item.offsetTop + item.offsetHeight / 2;
    const rawProgress =
      (itemCenter + EDGE_BUFFER_PX - viewportHeight / 2) / extendedDistance;
    return gsap.utils.clamp(margin, 1 - margin, rawProgress);
  });
}

// keeps a keyframe list strictly increasing in progress - two touch
// points can otherwise land on (or clamp to) the exact same progress
// value (e.g. an item's center sitting at/above the very top of the
// scrollable range clamps to 0, colliding with the start keyframe), and
// smapleKeyframes divides by the gap between consecutive progresses
function sanitizeKeyframes(keyframes) {
  const sorted = [...keyframes].sort((a, b) => a.progress - b.progress);
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].progress > result[result.length - 1].progress) {
      result.push(sorted[i]);
    }
  }
  return result;
}

// alternates the bee's horizontal sway toward each spotlight item's side
// (odd items sit left, even sit right, matching the CSS nth-child rule),
// touching each item at its own measured progress with a brief settle
// point easing back toward center in between
function buildHorizontalKeyframes(touchProgresses) {
  // starts centered (0) rather than nudged aside - the robot rests
  // visibly above the intro heading at progress 0, so its resting spot
  // needs to line up with the centered text, not just look fine mid-flight.
  // the EDGE_BUFFER_PX-extended range and TOUCH_MARGIN_PX backstop (see
  // measureTouchProgresses) together guarantee no touch point ever lands
  // exactly on 0 or 1, so this and the final keyframe below can never
  // collide with (and get silently overridden by) a real touch point
  const keyframes = [{ progress: 0, offset: 0 }];

  touchProgresses.forEach((touchProgress, i) => {
    const isLeft = i % 2 === 0;
    keyframes.push({ progress: touchProgress, offset: isLeft ? -0.25 : 0.25 });

    const nextTouchProgress = touchProgresses[i + 1] ?? 1;
    const settleProgress =
      touchProgress + (nextTouchProgress - touchProgress) * 0.35;
    keyframes.push({ progress: settleProgress, offset: isLeft ? 0.05 : -0.05 });
  });

  keyframes.push({ progress: 1, offset: 0.15 });
  return sanitizeKeyframes(keyframes);
}

// the robot holds at "centerDrop" (whatever vertical position puts it
// level with the viewport's own center, see updateFlightKeyframes) at
// every single one of an item's real touch progresses, so it's always
// exactly level with whichever image is centered in view at that moment -
// it only departs that height at the very start (flying in from above)
// and very end (flying out below)
function buildVerticalKeyframes(touchProgresses, centerDrop) {
  const keyframes = [
    { progress: 0, drop: 0 },
    ...touchProgresses.map((touchProgress) => ({
      progress: touchProgress,
      drop: centerDrop,
    })),
    { progress: 1, drop: 1 },
  ];
  return sanitizeKeyframes(keyframes);
}

export default function WorkBee() {
  // same masked bottom-to-top line reveal used elsewhere on the site
  // (About/Footer/Contact), kept in its own effect so it can't interfere
  // with the bee-flight scroll rig below
  useEffect(() => {
    gsap.registerPlugin(SplitText);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    function reveal(trigger, elements) {
      if (!trigger || !elements.length) return null;

      let hasPlayed = false;

      return SplitText.create(elements, {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit(self) {
          if (prefersReducedMotion || hasPlayed) {
            gsap.set(self.lines, { yPercent: 0 });
            return;
          }

          gsap.set(self.lines, { yPercent: 110 });

          return gsap.to(self.lines, {
            yPercent: 0,
            duration: 1,
            ease: "power3.out",
            stagger: 0.05,
            scrollTrigger: {
              trigger,
              start: "top 75%",
              once: true,
              onEnter: () => {
                hasPlayed = true;
              },
            },
          });
        },
      });
    }

    const introHeading = document.querySelector(".work-bee-page .intro h1");
    const items = Array.from(
      document.querySelectorAll(".work-bee-page .spotlight-item")
    );

    const splits = [
      reveal(introHeading, introHeading ? [introHeading] : []),
      ...items.map((item) =>
        reveal(item, Array.from(item.querySelectorAll(".spotlight-item-copy p")))
      ),
    ].filter(Boolean);

    return () => {
      splits.forEach((split) => split.revert());
    };
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // reuse the site's single global Lenis instance (from SmoothScroll)
    // instead of spinning up a second one here - two independent Lenis
    // instances both intercepting wheel input and driving smoothing at once
    // is what was causing the scroll to visibly stutter/jump on this page
    let unsubscribeScroll = () => {};
    const cleanupLenisReady = onLenisReady((lenis) => {
      unsubscribeScroll = lenis.on("scroll", ScrollTrigger.update);
    });

    const beeElement = document.querySelector(".work-bee-page .bee");

    // read from the actual CSS-driven box instead of a fixed constant, so
    // the laptop-only size bump in work-bee.css (a media query on .bee)
    // is the single source of truth - the canvas resolution and all the
    // flight-path math below just follow whatever size that resolves to,
    // and stay correct if that ever changes again
    // offsetWidth (a layout property, unaffected by the flight path's own
    // CSS rotation transform on this same element) rather than
    // getBoundingClientRect(), whose rotated bounding box would read as
    // larger than the actual box the moment the robot is tilted even a
    // few degrees
    let BEE_SIZE = beeElement.offsetWidth;

    // --- flying-robot 3D model, replacing the old Lottie bee -----------
    // a small, self-contained WebGL scene rendered into the .bee element
    // itself, which keeps moving exactly as before via the existing
    // gsap.set(beeElement, {x, y, rotation}) flight-path code below -
    // only what's drawn *inside* that moving container changed
    let disposed = false;
    let robotModel = null;

    const robotScene = new THREE.Scene();
    const robotCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    robotCamera.position.set(0, 0, 4);
    robotCamera.lookAt(0, 0, 0);

    const robotRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    robotRenderer.setSize(BEE_SIZE, BEE_SIZE);
    // capped rather than the raw devicePixelRatio - this canvas is tiny and
    // constantly re-rendering every frame, so an uncapped ratio on a
    // high-DPI screen would cost real GPU time for detail nobody can see
    // at this size
    robotRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    beeElement.appendChild(robotRenderer.domElement);

    // this model's material is fully metallic with zero roughness (a
    // mirror-smooth silver finish) - metals have essentially no direct-light
    // response, so without something to reflect they render almost black
    // regardless of how many lights point at them. A cheap generic room
    // environment (the same technique used for the monitor model) gives it
    // something to bounce, revealing the actual silver look - this is a
    // one-time setup cost, not a per-frame one
    const pmremGenerator = new THREE.PMREMGenerator(robotRenderer);
    const robotEnvTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    robotScene.environment = robotEnvTexture;

    robotScene.add(new THREE.AmbientLight(0xffffff, 2.5));
    const robotKeyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    robotKeyLight.position.set(3, 4, 5);
    robotScene.add(robotKeyLight);
    const robotFillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    robotFillLight.position.set(-4, -2, 3);
    robotScene.add(robotFillLight);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load("/model/flying-robot3.glb", (gltf) => {
      if (disposed) return;
      const model = gltf.scene;

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      // fit the model comfortably inside the small viewport regardless of
      // whatever scale/units it was authored at. Fitting to the largest
      // single axis isn't enough here - the idle animation rotates the
      // model on multiple axes, so an off-center corner (e.g. an ear/wing)
      // sweeps out to the bounding box's *diagonal* radius, not just half
      // its width. Fitting to that diagonal (the box's bounding-sphere
      // radius) is the only size that's safe at every rotation angle, and
      // 1 unit leaves clear headroom inside the ~1.26-unit frustum
      // half-extent at this camera distance/FOV
      const size = box.getSize(new THREE.Vector3());
      const boundingRadius = size.length() / 2 || 1;
      model.scale.setScalar(1 / boundingRadius);

      robotModel = model;
      robotScene.add(model);
    });

    // the model file has no baked-in animation clips, so this gives it a
    // small, continuous idle motion (a gentle bob and wing-like tilt) on
    // top of whatever the scroll-driven flight path is doing to the
    // container itself - subtle and cheap, just a couple of sine waves
    function animateRobotIdle(elapsedSeconds) {
      if (!robotModel) return;
      robotModel.position.y = Math.sin(elapsedSeconds * 2) * 0.12;
      robotModel.rotation.z = Math.sin(elapsedSeconds * 1.3) * 0.12;
      robotModel.rotation.y = Math.sin(elapsedSeconds * 0.6) * 0.3;
    }

    const HEADING_GAP = 40;

    const spotlightSection = document.querySelector(".work-bee-page .spotlight");
    const spotlightItems = Array.from(
      document.querySelectorAll(".work-bee-page .spotlight-item")
    );
    const spotlightImages = spotlightItems
      .map((item) => item.querySelector("img"))
      .filter(Boolean);

    // these all depend on the viewport and on the *actual rendered* size
    // of every spotlight image, so none of them can be computed once and
    // left alone - updateFlightKeyframes recomputes the lot and is called
    // on mount, whenever a spotlight image finishes loading (its intrinsic
    // aspect ratio changes .spotlight-item's height, shifting every touch
    // point after it), and on resize/orientation change
    let flightStartY;
    let flightEndY;
    let horizontalCenter;
    let SWAY_REACH;
    let horizontalKeyframes;
    let verticalKeyframes;

    function updateFlightKeyframes() {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // re-measure in case a resize crossed the laptop breakpoint (see
      // BEE_SIZE above) - the renderer's actual canvas resolution has to
      // be updated to match, or it'll keep drawing at the old size while
      // CSS stretches/shrinks the box around it
      const measuredBeeSize = beeElement.offsetWidth;
      if (measuredBeeSize && measuredBeeSize !== BEE_SIZE) {
        BEE_SIZE = measuredBeeSize;
        robotRenderer.setSize(BEE_SIZE, BEE_SIZE);
      }

      // rests just above the intro heading (rather than off-screen) so the
      // robot is visible immediately, sitting over "Where Ideas Take
      // Flight" before the user ever scrolls - falls back to the old
      // off-screen position if the heading isn't found for some reason
      const introHeadingRect = document
        .querySelector(".work-bee-page .intro h1")
        ?.getBoundingClientRect();
      flightStartY = introHeadingRect
        ? introHeadingRect.top - BEE_SIZE - HEADING_GAP
        : -BEE_SIZE - 60;
      flightEndY = viewportHeight + 50;

      horizontalCenter = (viewportWidth - BEE_SIZE) / 2;
      SWAY_REACH = viewportWidth * 0.4;

      const touchProgresses = measureTouchProgresses(
        spotlightSection,
        spotlightItems,
        viewportHeight
      );
      horizontalKeyframes = buildHorizontalKeyframes(touchProgresses);

      // the one vertical height the robot returns to at every touch point -
      // level with the viewport's own center, which is exactly where each
      // item's center sits at that item's touch progress by construction
      const centerTouchY = viewportHeight / 2 - BEE_SIZE / 2;
      const centerDrop = gsap.utils.clamp(
        0,
        1,
        (centerTouchY - flightStartY) / (flightEndY - flightStartY)
      );
      verticalKeyframes = buildVerticalKeyframes(touchProgresses, centerDrop);

      ScrollTrigger.refresh();
    }

    function smapleKeyframes(keyframes, progress, valuekey) {
      for (let i = 0; i < keyframes.length - 1; i++) {
        const from = keyframes[i];
        const to = keyframes[i + 1];

        if (progress >= from.progress && progress <= to.progress) {
          const segmentProgress =
            (progress - from.progress) / (to.progress - from.progress);
          const eased =
            segmentProgress * segmentProgress * (3 - 2 * segmentProgress);

          return from[valuekey] + (to[valuekey] - from[valuekey]) * eased;
        }
      }

      return keyframes[keyframes.length - 1][valuekey];
    }

    // BEE_LERP is how lazily the rendered bee chases its scroll-computed
    // target each frame (lower = smoother/lazier trail, higher = snappier).
    // The scroll progress only ever updates `target` below; a persistent
    // ticker loop is what actually eases `current` toward it every frame,
    // so the bee keeps drifting into place for a few frames after scrolling
    // stops instead of snapping straight to the scroll-driven position.
    const BEE_LERP = 0.08;

    const target = { x: 0, y: 0, rotation: 0 };
    const current = { x: 0, y: 0, rotation: 0 };

    function computeTarget(progress) {
      const horizontalOffset =
        smapleKeyframes(horizontalKeyframes, progress, "offset") * SWAY_REACH;
      target.x = horizontalCenter + horizontalOffset;

      const verticalDrop = smapleKeyframes(verticalKeyframes, progress, "drop");
      target.y = flightStartY + (flightEndY - flightStartY) * verticalDrop;

      const lookAhead = Math.min(1, progress + 0.02);
      const travelDirection =
        smapleKeyframes(horizontalKeyframes, lookAhead, "offset") -
        smapleKeyframes(horizontalKeyframes, progress, "offset");
      target.rotation = gsap.utils.clamp(-14, 14, travelDirection * 120);
    }

    // skips the 3D render entirely while the section is off-screen (still
    // scrolled to the intro, or already past the last image) - the CSS
    // transform driving position keeps updating regardless, only the
    // (comparatively expensive) WebGL draw call is gated
    let isIntersecting = false;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(spotlightSection);

    function renderBee(time = 0) {
      current.x += (target.x - current.x) * BEE_LERP;
      current.y += (target.y - current.y) * BEE_LERP;
      current.rotation += (target.rotation - current.rotation) * BEE_LERP;

      gsap.set(beeElement, {
        x: current.x,
        y: current.y,
        rotation: current.rotation,
      });

      if (isIntersecting) {
        animateRobotIdle(time);
        robotRenderer.render(robotScene, robotCamera);
      }
    }

    // a first pass with whatever layout exists synchronously on mount -
    // correct if every image is already cached (a warm reload), a
    // reasonable starting point otherwise, and superseded the moment any
    // image below actually loads
    updateFlightKeyframes();

    computeTarget(0);
    Object.assign(current, target); // snap to the starting position, no lerp-in from 0,0
    renderBee();
    gsap.ticker.add(renderBee);

    // scroll
    const flight = { ScrollProgress: 0 };

    const flightTween = gsap.to(flight, {
      ScrollProgress: 1,
      ease: "none",
      scrollTrigger: {
        trigger: ".work-bee-page .spotlight",
        // extended by EDGE_BUFFER_PX on both ends - see the comment on
        // that constant above; measureTouchProgresses' math assumes this
        // exact same extended range
        start: `top top+=${EDGE_BUFFER_PX}`,
        end: `bottom bottom-=${EDGE_BUFFER_PX}`,
        scrub: true,
      },
      onUpdate: () => computeTarget(flight.ScrollProgress),
    });

    // a cold load has every spotlight image at intrinsic size 0 until it
    // actually loads, which is what made the very first (and any
    // still-loading) touch point wrong - each load event means the
    // section's true layout just changed (that item's height, and every
    // touch point after it), so recompute for real rather than trusting
    // the on-mount guess
    const pendingImages = spotlightImages.filter((img) => !img.complete);
    const handleImageLoad = () => updateFlightKeyframes();
    pendingImages.forEach((img) => img.addEventListener("load", handleImageLoad));

    const onResize = () => updateFlightKeyframes();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      pendingImages.forEach((img) =>
        img.removeEventListener("load", handleImageLoad)
      );
      flightTween.kill();
      gsap.ticker.remove(renderBee);
      cleanupLenisReady();
      unsubscribeScroll();
      visibilityObserver.disconnect();

      robotScene.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      });
      robotEnvTexture.dispose();
      pmremGenerator.dispose();
      robotRenderer.dispose();
      if (robotRenderer.domElement.parentNode === beeElement) {
        beeElement.removeChild(robotRenderer.domElement);
      }
    };
  }, []);

  return (
    <div className="work-bee-page">
      <section className="intro">
        <h1>Where Ideas Take Flight</h1>
      </section>

      <section className="spotlight">
        {SPOTLIGHT_ITEMS.map((item, index) => (
          <div className="spotlight-item" key={item.src}>
            <img src={item.src} alt="" />

            <div className="spotlight-item-copy">
              <p>{item.title}</p>
              <p>{String(index + 1).padStart(2, "0")}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="lottie-container">
        <div className="bee"></div>
      </div>
    </div>
  );
}
