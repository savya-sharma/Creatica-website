"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import RollingText from "./RollingText";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import FooterInfoGrid from "./FooterInfoGrid";
import CornerDownRightIcon from "./icons/CornerDownRightIcon";

gsap.registerPlugin(ScrollTrigger, SplitText);

export default function Footer() {
  const footerRef = useRef(null);
  const pathname = usePathname();
  // the Contact page builds this same closing block into its own
  // scrollable column (it has its own independent scroll container, not
  // the page scroll), so the site-wide footer would just be dead,
  // unreachable content sitting below it
  const hideOnContactPage = pathname?.startsWith("/contact");
  // /work is a single full-viewport WebGL section (the ring carousel) with
  // nothing to scroll to - a footer sitting below it would both never be
  // reachable and give the page just enough extra height to let vertical
  // scroll/wheel input leak past the carousel onto the page instead of
  // driving its rotation
  const hideOnWorkPage = pathname?.startsWith("/work");

  // same masked bottom-to-top line reveal used elsewhere on the site,
  // triggered once when the footer itself scrolls into view. The footer
  // lives in the root layout and outlives every page, so this is rebuilt
  // per route: the footer element is recreated after /work or /contact
  // (which render none), and each page puts it at a different scroll
  // position - a reveal set up once for the first page could point at a
  // removed element or wait at an offset the new page never reaches,
  // leaving the footer's text hidden.
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const elements = Array.from(
      footer.querySelectorAll(
        ".site-footer-heading, .site-footer-blurb, .site-footer-col h3, .site-footer-col p:not(.site-footer-email), .site-footer-col li a"
      )
    );
    if (!elements.length) return;

    // guards against the reveal re-hiding/replaying text that has already
    // been shown once, if autoSplit re-splits later (resize, a web font
    // finishing its load, etc.)
    let hasPlayed = false;

    const split = SplitText.create(elements, {
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
            trigger: footer,
            start: "top 75%",
            once: true,
            onEnter: () => {
              hasPlayed = true;
            },
          },
        });
      },
    });

    return () => {
      split.revert();
    };
  }, [pathname]);

  if (hideOnContactPage || hideOnWorkPage) return null;

  return (
    <footer className="site-footer" ref={footerRef}>
      <div className="site-footer-cta">
        <div className="site-footer-cta-main">
          <h2 className="site-footer-heading">
            <em>Let&apos;s</em> Build
            <br />
            <span className="site-footer-arrow">
              <CornerDownRightIcon />
            </span>{" "}
            Something
            <br />
            Meaningful
          </h2>

          <a className="site-footer-button btn-glass" href="mailto:contact@creaticacrown.com">
            <RollingText>Start Project</RollingText> <span>&rarr;</span>
          </a>
        </div>

        <div className="site-footer-info">
          <p className="site-footer-blurb">
            Have an idea, a product, or a vision? We&apos;d
            <br />
            love to help you bring it to life
          </p>

          <FooterInfoGrid />
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>&copy; 2025-{new Date().getFullYear()}. All rights reserved</span>
        <div className="site-footer-bottom-links">
          <Link href="/policy">
            <RollingText>Terms of Services</RollingText>
          </Link>
          <Link href="/policy?tab=privacy">
            <RollingText>Privacy Policy</RollingText>
          </Link>
        </div>
      </div>
    </footer>
  );
}
