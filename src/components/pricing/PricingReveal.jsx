"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// The site's masked line reveal (as on About and Services) for the pricing
// pages: each block's text rises line by line out of a mask as the block
// reaches the viewport, and its quieter parts (pills, prices, buttons) fade
// up after it. Drop it anywhere inside a .pricing-page.
//
// Text inside a closed plan's details is left alone - it is revealed by
// opening the plan. Until the lines are split and placed, the page's text
// stays hidden (.pricing-page:not(.is-text-ready) in pricing.css), so it
// never paints in full and then vanishes.

const BLOCKS = ".pricing-intro, .pricing-service-head, .pricing-row, .pricing-dir-row, .pricing-plans-note, .pricing-block";
const LINES = "h1, h2, h3, p, .pricing-terms li";
const FADES = ".pricing-trail-home, .pricing-tags, .pricing-price, .pricing-button, .pricing-addon";
const START = "top 85%";

export default function PricingReveal() {
  const markerRef = useRef(null);

  useEffect(() => {
    const page = markerRef.current?.closest(".pricing-page");
    if (!page) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const outsideDetails = (el) => !el.closest(".pricing-details");

    const ctx = gsap.context(() => {
      const blocks = gsap.utils.toArray(BLOCKS, page);

      const splits = blocks.map((block) => {
        const lines = Array.from(block.querySelectorAll(LINES)).filter(outsideDetails);
        // a fade-up item already reveals its own text
        const own = lines.filter((el) => !el.closest(FADES));
        if (!own.length) return null;
        let hasPlayed = false;
        return SplitText.create(own, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit(self) {
            if (reduced || hasPlayed) {
              gsap.set(self.lines, { yPercent: 0 });
              return undefined;
            }
            gsap.set(self.lines, { yPercent: 110 });
            return gsap.to(self.lines, {
              yPercent: 0,
              duration: 0.9,
              ease: "power3.out",
              stagger: 0.05,
              scrollTrigger: {
                trigger: block,
                start: START,
                once: true,
                onEnter: () => {
                  hasPlayed = true;
                },
              },
            });
          },
        });
      });

      if (!reduced) {
        blocks.forEach((block) => {
          const fades = Array.from(block.querySelectorAll(FADES)).filter(outsideDetails);
          if (!fades.length) return;
          gsap.from(fades, {
            autoAlpha: 0,
            y: 12,
            duration: 0.8,
            delay: 0.15,
            ease: "power3.out",
            stagger: 0.06,
            scrollTrigger: { trigger: block, start: START, once: true },
          });
        });
      }

      // everything is split and placed: the text may paint now
      page.classList.add("is-text-ready");

      return () => splits.forEach((split) => split?.revert());
    }, page);

    return () => {
      ctx.revert();
      page.classList.remove("is-text-ready");
    };
  }, []);

  return <span ref={markerRef} hidden />;
}
