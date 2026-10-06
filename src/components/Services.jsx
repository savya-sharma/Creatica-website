"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { onLenisReady } from "@/lib/lenis";

gsap.registerPlugin(InertiaPlugin, ScrollTrigger, SplitText);

// `tier` sets each entry's weight in the index: "featured" (Web Development,
// the studio's strongest capability) leads, "primary" carries the main group,
// "secondary" sits as a compact pair beneath them
const SERVICES = [
  {
    title: "Digital Marketing",
    tier: "primary",
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
    tier: "featured",
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
    tier: "primary",
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
    tier: "secondary",
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
    tier: "secondary",
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

const REVEAL_START = "top 80%";

export default function Services() {
  const sectionRef = useRef(null);
  const indexRef = useRef(null);
  const markerRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);

  // Each block (the intro, then every service) reveals as it reaches the
  // viewport rather than all five at once when the section's top does: its
  // display type ([data-split]) rises line by line out of a mask, its
  // quieter metadata ([data-fade]) follows, and its hairline draws in from
  // the left.
  useEffect(() => {
    const container = sectionRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray(".services-intro, .service", container);

      const splits = blocks.map((block) => {
        // guards against the scroll reveal re-hiding/replaying text that has
        // already been shown once, if autoSplit re-splits later (resize, a
        // web font finishing its load, etc.)
        let hasPlayed = false;
        return SplitText.create(block.querySelectorAll("[data-split]"), {
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
              duration: 0.8,
              ease: "power3.out",
              stagger: 0.06,
              scrollTrigger: {
                trigger: block,
                start: REVEAL_START,
                once: true,
                onEnter: () => {
                  hasPlayed = true;
                },
              },
            });
          },
        });
      });

      if (!prefersReducedMotion) {
        blocks.forEach((block) => {
          const scrollTrigger = { trigger: block, start: REVEAL_START, once: true };
          gsap.from(block.querySelectorAll("[data-fade]"), {
            autoAlpha: 0,
            y: 12,
            duration: 0.8,
            delay: 0.15,
            ease: "power3.out",
            stagger: 0.05,
            scrollTrigger,
          });
          const rule = block.querySelector(".service-rule");
          if (rule) {
            gsap.from(rule, {
              scaleX: 0,
              transformOrigin: "left center",
              duration: 1.2,
              ease: "power3.inOut",
              scrollTrigger,
            });
          }
        });
      }

      return () => splits.forEach((split) => split.revert());
    }, container);

    return () => ctx.revert();
  }, []);

  // The section's one motif: a hairline rail down the index whose darker
  // segment glides to whichever service the pointer is on, and rests on Web
  // Development otherwise. Hover-capable pointers only - the CSS hides the
  // rail on touch, where there is nothing for it to follow.
  useEffect(() => {
    const index = indexRef.current;
    const marker = markerRef.current;
    if (!index || !marker) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const rows = Array.from(index.querySelectorAll(".service"));
    const home = index.querySelector(".service--featured") ?? rows[0];
    let current = home;

    // spans the row's label + title, measured against the index itself so
    // the result doesn't depend on scroll position
    const place = (row, immediate = false) => {
      current = row;
      const head = row.querySelector(".service-head");
      const indexTop = index.getBoundingClientRect().top;
      const headRect = head.getBoundingClientRect();
      gsap.to(marker, {
        y: headRect.top - indexTop,
        height: headRect.height,
        duration: immediate ? 0 : 0.7,
        ease: "power3.inOut",
        overwrite: true,
      });
    };

    const handlers = rows.map((row) => {
      const onEnter = () => place(row);
      row.addEventListener("pointerenter", onEnter);
      return [row, onEnter];
    });
    const onLeave = () => place(home);
    index.addEventListener("pointerleave", onLeave);

    // type reflowing (resize, fonts, the line split) moves the rows under it
    const observer = new ResizeObserver(() => place(current, true));
    observer.observe(index);

    return () => {
      handlers.forEach(([row, onEnter]) => row.removeEventListener("pointerenter", onEnter));
      index.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
      gsap.killTweensOf(marker);
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
      <header className="services-intro">
        <p className="services-eyebrow" data-fade>
          <span>Services</span>
          <span className="services-eyebrow-slash" aria-hidden="true">/</span>
          <span>Capabilities</span>
        </p>
        <h2 className="services-statement" data-split>
          Where strategy, design and technology <em>meet.</em>
        </h2>
      </header>

      <div className="services-index" ref={indexRef}>
        <span className="services-rail" aria-hidden="true">
          <span className="services-rail-marker" ref={markerRef} />
        </span>

        {SERVICES.map((service, index) => {
          const number = String(index + 1).padStart(2, "0");
          const titleId = `service-${number}`;
          return (
            <article
              className={`service service--${service.tier}`}
              key={service.title}
              aria-labelledby={titleId}
            >
              <span className="service-rule" aria-hidden="true" />

              <div className="service-head">
                <span className="service-number" data-fade>
                  {number}
                </span>
                <h3 className="service-title" id={titleId} data-split>
                  {service.title}
                </h3>
              </div>

              <div className="service-body">
                <p className="service-statement" data-split>
                  {service.statement}
                </p>

                <div className="service-capabilities" data-fade>
                  <p className="service-label" id={`${titleId}-capabilities`}>
                    Capabilities
                  </p>
                  <ul aria-labelledby={`${titleId}-capabilities`}>
                    {service.capabilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <dl className="service-delivery" data-fade>
                  <dt className="service-label">Delivery</dt>
                  <dd>{service.delivery}</dd>
                </dl>
              </div>
            </article>
          );
        })}
      </div>

      {/* <div className="marquee" ref={viewportRef}>
        <div className="marquee-track" ref={trackRef}></div>
      </div> */}
    </div>
  );
}
