"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { onLenisReady } from "@/lib/lenis";

gsap.registerPlugin(InertiaPlugin, ScrollTrigger, SplitText);

const SERVICES = [
  {
    title: "Digital Marketing",
    statement:
      "Strategic campaigns designed to build awareness, reach the right audience, and drive growth.",
    capabilities: [
      "Meta, Google & Snapchat Ads",
      "Brand Awareness Campaigns",
      "Campaign Insights & Performance Analytics",
      "Ad Campaign Setup & Management",
      "Retargeting Campaigns",
      "Static Creative Design",
    ],
    delivery: "15–20 Days",
  },
  {
    title: "Web Development",
    statement: "Creative digital experiences built from concept to launch.",
    capabilities: [
      "Creative Direction & Visual Concept",
      "UX/UI Design",
      "Custom Website Development",
      "Responsive Design",
      "Interactive Animations & Micro-interactions",
      "Product / Service Presentation",
      "Social Media & Third-party Integration",
      "Testing, Optimization & Deployment",
    ],
    delivery: "3–4 Weeks",
  },
  {
    title: "Video Creation",
    statement:
      "Visual storytelling created to communicate your brand with impact.",
    capabilities: [
      "Creative Concept & Direction",
      "Storyboard & Visual Planning",
      "Product-focused Videos",
      "Social Media Content",
      "Motion Graphics & Transitions",
      "Video Editing",
    ],
    delivery: "15–20 Days",
  },
  {
    title: "Logo Design",
    statement: "Distinctive identities designed around your brand's character.",
    capabilities: [
      "Brand & Business Research",
      "2–4 Initial Logo Concepts",
      "Creative Direction",
      "Logo Refinement",
      "Brand Identity Creation",
      "High-resolution Final Files",
    ],
    delivery: "2–4 Days",
  },
  {
    title: "Label Design",
    statement: "Packaging visuals designed to make your product stand out.",
    capabilities: [
      "Product & Market Research",
      "Creative Label Direction",
      "2 Premium Design Concepts",
      "Typography & Visual Hierarchy",
      "Product Mockup Presentation",
      "Design Refinement",
      "Print-ready Files",
    ],
    delivery: "3–5 Days",
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
  const sectionRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);

  // premium bottom-to-top masked line reveal for the section's own text
  // (title, card headings, card list items) - fully separate from the
  // marquee effect below so neither can interfere with the other
  useEffect(() => {
    const container = sectionRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // guards against the scroll reveal re-hiding/replaying text that has
    // already been shown once, if autoSplit re-splits later (resize, a web
    // font finishing its load, etc.)
    let hasPlayed = false;

    const split = SplitText.create(
      Array.from(
        container.querySelectorAll(
          ".services-title, .service-card h3, .service-card-statement, .service-card li"
        )
      ),
      {
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
            duration: 0.6,
            ease: "power3.out",
            stagger: 0.05,
            scrollTrigger: {
              trigger: container,
              start: "top 75%",
              once: true,
              onEnter: () => {
                hasPlayed = true;
              },
            },
          });
        },
      }
    );

    return () => {
      split.revert();
    };
  }, []);

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
    <div className="services" ref={sectionRef}>
      <h2 className="services-title">Services</h2>

      <div className="services-grid">
        {SERVICES.map((service, index) => (
          <article
            className={
              service.featured ? "service-card service-card--featured" : "service-card"
            }
            key={service.title}
          >
            <div className="service-card-heading">
              <span className="service-card-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{service.title}</h3>
            </div>

            <p className="service-card-statement">{service.statement}</p>

            <ul className="service-card-capabilities">
              {service.capabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {service.process && (
              <ol className="service-card-process">
                {service.process.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}

            <div className="service-card-delivery">
              <span>Delivery</span>
              <span>{service.delivery}</span>
            </div>
          </article>
        ))}
      </div>

      {/* <div className="marquee" ref={viewportRef}>
        <div className="marquee-track" ref={trackRef}></div>
      </div> */}
    </div>
  );
}
