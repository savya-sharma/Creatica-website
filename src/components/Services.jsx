"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { onLenisReady } from "@/lib/lenis";

gsap.registerPlugin(InertiaPlugin);

const SERVICES = [
  {
    title: "Digital Marketing",
    items: [
      "2 Premium sample designs",
      "15-20 Days delivery",
      "Unlimited changes",
      "Research and business",
      "Product mockup images",
    ],
  },
  {
    title: "Web Development",
    items: [
      "3-4 Week delivery",
      "Complete website design",
      "Banner & images",
      "Product Listing",
      "Social media integration",
      "Responsive designs",
    ],
  },
  {
    title: "Video Creation",
    items: [
      "2 Premium sample designs",
      "15-20 Days delivery",
      "Unlimited changes",
      "Research and business",
      "Product mockup images",
    ],
  },
  {
    title: "Logo design",
    items: [
      "2+2 Sample designs",
      "15-20 Days delivery",
      "Unlimited changes",
      "Research and business",
      "Brand identity creation",
      "High resolution (HD)",
    ],
  },
  {
    title: "Label Design",
    items: [
      "2 Premium sample designs",
      "15-20 Days delivery",
      "Unlimited changes",
      "Research and business",
      "Product mockup images",
    ],
  },
];

const MARQUEE_TEXT = "Start your story";

// tuning for the scroll-driven push: a normal scroll produces a gentle
// nudge, a fast flick produces a stronger one, but velocity is always
// clamped so an aggressive wheel/trackpad burst can't send the strip flying
const VELOCITY_SCALE = 14; // lenis's per-frame scroll delta -> track px/sec
const MAX_VELOCITY = 900; // px/sec clamp fed into InertiaPlugin
const INERTIA_RESISTANCE = 300; // higher = decelerates and settles sooner

export default function Services() {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    let setWidth = 0;
    let posX = 0;

    // builds one seamless set wide enough to always cover the viewport (with
    // margin), then duplicates it once so wrapping the track's x between
    // -setWidth and 0 never exposes empty space, however wide the screen is
    const buildTrack = () => {
      track.innerHTML = "";

      let i = 0;
      while (track.scrollWidth < window.innerWidth * 1.5) {
        const span = document.createElement("span");
        span.className = `marquee-item${i % 2 === 0 ? "" : " is-alt"}`;
        span.textContent = MARQUEE_TEXT;
        track.appendChild(span);
        i++;
      }

      setWidth = track.scrollWidth;

      Array.from(track.children)
        .map((node) => node.cloneNode(true))
        .forEach((node) => track.appendChild(node));

      posX = gsap.utils.wrap(-setWidth, 0, posX);
      gsap.set(track, { x: posX });
    };

    buildTrack();

    // the track has no autoplay - it only ever moves in response to a real
    // scroll, so `pos.x` (unbounded) only changes when InertiaPlugin is
    // actively animating it, and sits frozen the rest of the time
    const pos = { x: posX };
    let inertiaTween = null;

    const render = () => {
      posX = gsap.utils.wrap(-setWidth, 0, pos.x);
      gsap.set(track, { x: posX });
    };

    // driven by Lenis's own scroll stream (not a raw "wheel" listener) so it
    // stays in sync with the site's smooth scroll and reacts identically to
    // wheel, trackpad and touch input instead of racing a second scroll
    // system. Lenis already throttles this to one call per rendered frame,
    // so re-targeting the same tween here is cheap - InertiaPlugin's
    // overwrite replaces the in-flight animation rather than stacking a new
    // one, and once scroll input stops arriving the last tween just keeps
    // decaying on its own until it settles.
    const handleLenisScroll = (lenis) => {
      const rawVelocity = lenis.velocity;
      if (!rawVelocity) return;

      // scroll down (positive velocity) -> track moves right (positive x)
      // scroll up (negative velocity) -> track moves left (negative x)
      const velocity = gsap.utils.clamp(
        -MAX_VELOCITY,
        MAX_VELOCITY,
        rawVelocity * VELOCITY_SCALE
      );

      inertiaTween?.kill();
      inertiaTween = gsap.to(pos, {
        inertia: {
          x: { velocity, max: MAX_VELOCITY },
          resistance: INERTIA_RESISTANCE,
        },
        onUpdate: render,
      });
    };

    let unsubscribeScroll = () => {};
    const cleanupReady = onLenisReady((lenis) => {
      unsubscribeScroll = lenis.on("scroll", handleLenisScroll);
    });

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        buildTrack();
        pos.x = posX;
      }, 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      inertiaTween?.kill();
      cleanupReady();
      unsubscribeScroll();
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <div className="services">
      <h2 className="services-title">Services</h2>

      <div className="services-grid">
        {SERVICES.map((service) => (
          <div className="service-card" key={service.title}>
            <h3>{service.title}</h3>
            <ul>
              {service.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="marquee" ref={viewportRef}>
        <div className="marquee-track" ref={trackRef}></div>
      </div>
    </div>
  );
}
