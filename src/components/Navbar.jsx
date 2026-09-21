"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import gsap from "gsap";
import { scrambleHoverProps } from "@/lib/scrambleHover";
import { onLenisReady } from "@/lib/lenis";

function NavLink({ href = "#", children }) {
  return (
    <Link href={href} className="nav-link-swap" {...scrambleHoverProps}>
      <span className="nav-link-swap-track">
        <span className="nav-link-swap-text scramble-target">{children}</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const navRef = useRef(null);
  // pages swapped again: /playground now renders the dark-background
  // bee-flight page (WorkBee), and /work renders the white-background
  // orbit carousel (Playground)
  const isDark =
    pathname?.startsWith("/about") || pathname?.startsWith("/playground");

  // hides the fixed navbar on scroll-down and drops it back in on
  // scroll-up, driven by the site's shared Lenis instance so it reacts to
  // wheel/trackpad/touch input identically instead of racing a separate
  // raw scroll listener
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    let hidden = false;

    function setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      gsap.to(nav, {
        yPercent: hidden ? -100 : 0,
        duration: 0.6,
        ease: "power3.out",
        overwrite: true,
      });
    }

    function handleScroll(lenis) {
      // stay visible near the top - avoids hiding before there's anything
      // to scroll past and keeps direction changes right at 0 from
      // flickering the nav
      if (lenis.scroll < nav.offsetHeight) {
        setHidden(false);
        return;
      }

      if (lenis.direction === 1) {
        setHidden(true);
      } else if (lenis.direction === -1) {
        setHidden(false);
      }
    }

    let unsubscribeScroll = () => {};
    const cleanupLenisReady = onLenisReady((lenis) => {
      unsubscribeScroll = lenis.on("scroll", handleScroll);
    });

    return () => {
      cleanupLenisReady();
      unsubscribeScroll();
      gsap.killTweensOf(nav);
    };
  }, []);

  return (
    <nav className={isDark ? "nav-dark" : ""} ref={navRef}>
      <div className="nav-logo">
        <Link href="/" aria-label="Creatica Crown home">
          <img src="/logo/LOGO.svg" alt="Creatica Crown" />
        </Link>
      </div>

      <p className="nav-tagline">Creative Marketing Agency</p>

      <div className="nav-links">
        <NavLink href="/about">About</NavLink>
        <NavLink href="/work">Work</NavLink>
        <NavLink href="/playground">Playground</NavLink>
        <NavLink href="/contact">Contact</NavLink>
      </div>
    </nav>
  );
}
