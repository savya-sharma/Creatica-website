"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import lottie from "lottie-web";
import { onLenisReady } from "@/lib/lenis";

export default function Playground() {
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

    const beeElement = document.querySelector(".bee");
    const shadowElement = document.querySelector(".bee-shadow");

    const beeAnim = lottie.loadAnimation({
      container: beeElement,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/bee/bee.json",
    });

    const shadowAnim = lottie.loadAnimation({
      container: shadowElement,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/bee/bee.json",
    });

    const BEE_SIZE = 125;
    const SHADOW_SIZE = 115;

    const flightStartY = -BEE_SIZE - 60;
    const flightEndY = window.innerHeight + 50;

    const viewportWidth = window.innerWidth;
    const horizontalCenter = (viewportWidth - BEE_SIZE) / 2;

    // spotlight items alternate left/right (odd items left, even items
    // right). These offsets alternate sign to swing the bee between both
    // sides, but stay small - just enough for the bee's own body to graze
    // each image's inner corner as it crosses, rather than flying deep over
    // the image's center. smapleKeyframes' smoothstep easing already rounds
    // the transitions between these points into a soft zigzag.
    const horizontalKeyframes = [
      { progress: 0.0, offset: -0.15 },
      { progress: 0.1, offset: -0.25 }, // item 1 (left) - touch inner corner
      { progress: 0.2, offset: -0.05 },
      { progress: 0.28, offset: 0.25 }, // item 2 (right) - touch inner corner
      { progress: 0.4, offset: -0.25 }, // item 3 (left)
      { progress: 0.52, offset: 0.05 },
      { progress: 0.58, offset: 0.25 }, // item 4 (right)
      { progress: 0.68, offset: -0.05 },
      { progress: 0.8, offset: -0.25 }, // item 5 (left)
      { progress: 0.9, offset: 0.25 }, // item 6 (right)
      { progress: 1.0, offset: 0.15 },
    ];

    const verticalKeyframes = [
      { progress: 0.0, drop: 0.0 },
      { progress: 0.05, drop: 0.16 },
      { progress: 0.3, drop: 0.34 },
      { progress: 0.6, drop: 0.5 },
      { progress: 0.85, drop: 0.66 },
      { progress: 1.0, drop: 1.0 },
    ];

    const SWAY_REACH = viewportWidth * 0.4;

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

    const SHADOW_OFFSET_X = 40;
    const SHADOW_OFFSET_Y = 60;

    const shadowCenterX = (BEE_SIZE - SHADOW_SIZE) / 2;
    const shadowCenterY = (BEE_SIZE - SHADOW_SIZE) / 2;

    // BEE_LERP is how lazily the rendered bee chases its scroll-computed
    // target each frame (lower = smoother/lazier trail, higher = snappier).
    // The scroll progress only ever updates `target` below; a persistent
    // ticker loop is what actually eases `current` toward it every frame,
    // so the bee keeps drifting into place for a few frames after scrolling
    // stops instead of snapping straight to the scroll-driven position.
    const BEE_LERP = 0.08;

    const target = { x: 0, y: 0, rotation: 0, heightFeel: 0 };
    const current = { x: 0, y: 0, rotation: 0, heightFeel: 0 };

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

      target.heightFeel = Math.sin(verticalDrop * Math.PI);
    }

    function renderBee() {
      current.x += (target.x - current.x) * BEE_LERP;
      current.y += (target.y - current.y) * BEE_LERP;
      current.rotation += (target.rotation - current.rotation) * BEE_LERP;
      current.heightFeel += (target.heightFeel - current.heightFeel) * BEE_LERP;

      gsap.set(beeElement, {
        x: current.x,
        y: current.y,
        rotation: current.rotation,
      });

      const shadowX =
        current.x + shadowCenterX + SHADOW_OFFSET_X * (0.5 + current.heightFeel);
      const shadowY =
        current.y + shadowCenterY + SHADOW_OFFSET_Y * (0.6 + current.heightFeel);

      gsap.set(shadowElement, {
        x: shadowX,
        y: shadowY,
        scale: 1,
        rotation: current.rotation,
        opacity: gsap.utils.clamp(0.15, 0.5, 0.5 - current.heightFeel * 0.5),
        transformOrigin: "50% 100%",
      });
    }

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
        trigger: ".spotlight",
        start: "top top",
        end: "bottom bottom",
        scrub: true,
      },
      onUpdate: () => computeTarget(flight.ScrollProgress),
    });

    const onResize = () => ScrollTrigger.refresh();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      flightTween.kill();
      gsap.ticker.remove(renderBee);
      cleanupLenisReady();
      unsubscribeScroll();
      beeAnim.destroy();
      shadowAnim.destroy();
    };
  }, []);

  return (
    <div className="playground-page">
      <section className="intro">
        <h1>A bee got loose in here — scroll down and see where it takes you.</h1>
      </section>

      <section className="spotlight">
        <div className="spotlight-item">
          <img src="/playgroundImg/img1.jpg" alt="" />

          <div className="spotlight-item-copy">
            <p>Fruiting Bodies</p>
            <p>01</p>
          </div>
        </div>

        <div className="spotlight-item">
          <img src="/playgroundImg/img2.jpg" alt="" />

          <div className="spotlight-item-copy">
            <p>Silk &amp; Sediment</p>
            <p>02</p>
          </div>
        </div>

        <div className="spotlight-item">
          <img src="/playgroundImg/img3.jpg" alt="" />

          <div className="spotlight-item-copy">
            <p>Lowland Drift</p>
            <p>03</p>
          </div>
        </div>

        <div className="spotlight-item">
          <img src="/playgroundImg/img4.jpg" alt="" />

          <div className="spotlight-item-copy">
            <p>Canvas Drape</p>
            <p>04</p>
          </div>
        </div>

        <div className="spotlight-item">
          <img src="/playgroundImg/img5.jpg" alt="" />

          <div className="spotlight-item-copy">
            <p>Culture Dish</p>
            <p>05</p>
          </div>
        </div>

        <div className="spotlight-item">
          <img src="/playgroundImg/img6.jpg" alt="" />

          <div className="spotlight-item-copy">
            <p>Culture Dish</p>
            <p>06</p>
          </div>
        </div>
      </section>

    

      <div className="lottie-container">
        <div className="bee-shadow"></div>
        <div className="bee"></div>
      </div>
    </div>
  );
}
