"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import HeroFluid, { DARK_FLUID_LOOK, HERO_FLUID_LOOK } from "./HeroFluid";
import { useFestival } from "@/festivals/useFestival";
import { festivalTheme } from "@/festivals/theme";

// The hero's mouse fluid, shared site-wide (layout.js): ONE layer behind a
// page's content and its footer together, so ink flows from the page into
// the footer instead of stopping at a hard edge where they meet.
//
// Pages listed here get the fluid over their own content too, in the look
// that suits their background; on every other page with a footer, the
// footer alone gets it (FooterFluid). /work runs its own copy over the ring
// (WorkRingCarousel.jsx) and has no footer. A key also covers the pages
// below it ("/pricing" -> "/pricing/<service>").
const PAGE_LOOKS = {
  "/": HERO_FLUID_LOOK,
  "/about": DARK_FLUID_LOOK,
  "/contact": HERO_FLUID_LOOK,
  "/connect": HERO_FLUID_LOOK,
  "/pricing": HERO_FLUID_LOOK,
};

function lookFor(pathname) {
  if (!pathname) return undefined;
  if (Object.hasOwn(PAGE_LOOKS, pathname)) return PAGE_LOOKS[pathname];
  const section = Object.keys(PAGE_LOOKS).find((key) => key !== "/" && pathname.startsWith(`${key}/`));
  return section ? PAGE_LOOKS[section] : undefined;
}

const hasPageFluid = (pathname) => lookFor(pathname) !== undefined;

const lerp = (a, b, t) => a + (b - a) * t;
const mixLook = (a, b, t) => ({
  inkAlpha: lerp(a.inkAlpha, b.inkAlpha, t),
  bloom: lerp(a.bloom, b.bloom, t),
  sheen: lerp(a.sheen, b.sheen, t),
});

// an active festival's ink colours over a look (festivals/registry.js theme);
// with none, the look is unchanged (white ink)
function useFestivalInk(look) {
  const { festival } = useFestival();
  const ink = festivalTheme(festival, "cursorInk");
  return ink ? { ...look, ...ink } : look;
}

// Share of the viewport the (dark) footer covers, in 5% steps.
function useFooterShare(enabled) {
  const [share, setShare] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const footer = document.querySelector(".site-footer");
      let next = 0;
      if (footer) {
        const r = footer.getBoundingClientRect();
        const covered = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
        next = Math.round(Math.min(Math.max(covered / window.innerHeight, 0), 1) * 20) / 20;
      }
      setShare((prev) => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled]);
  return share;
}

// The page + footer layer: a track spanning the zone, with a viewport-sized
// layer pinned inside it while the page scrolls by - stretched over the
// whole page, the fluid's cells and splats would dwarf the hero's. As the
// dark footer fills the screen, the ink eases into the softer dark look.
export default function SiteFluid() {
  const pathname = usePathname();
  const base = lookFor(pathname);
  const footerShare = useFooterShare(Boolean(base));
  const look = useFestivalInk(base ? mixLook(base, DARK_FLUID_LOOK, footerShare) : DARK_FLUID_LOOK);
  if (!base) return null;

  return (
    <div className="site-fluid" aria-hidden="true">
      <div className="site-fluid-viewport">
        <HeroFluid look={look} />
      </div>
    </div>
  );
}

// Footer-only layer, for pages that don't share the fluid with their
// footer. Same viewport-sized layer (so the same scale), clipped to the
// footer.
export function FooterFluid() {
  const pathname = usePathname();
  const look = useFestivalInk(DARK_FLUID_LOOK);
  if (hasPageFluid(pathname)) return null;

  return (
    <div className="footer-fluid" aria-hidden="true">
      <div className="footer-fluid-viewport">
        <HeroFluid look={look} />
      </div>
    </div>
  );
}
