"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import gsap from "gsap";
import { FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import { CustomEase } from "gsap/CustomEase";
import { scrambleHoverProps } from "@/lib/scrambleHover";
import { onLenisReady } from "@/lib/lenis";

gsap.registerPlugin(CustomEase);

// where the crown sits inside LOGO.svg, as fractions of the rendered logo
// image (measured by overlaying CROWN.svg on the logo; the crown is merged
// into the letter paths there so it can't be targeted directly)
const CROWN_RECT = { left: 0.3647, top: 0, width: 0.1813, height: 0.324 };
const BURST_COUNT = 11;
const MAX_LIVE_PARTICLES = 24;

const SOCIAL_LINKS = [
  {
    href: "https://www.instagram.com/creaticacrown/",
    label: "Creatica Crown on Instagram",
    Icon: FaInstagram,
  },
  {
    href: "https://www.linkedin.com/company/creaticacrown/posts/?feedView=all",
    label: "Creatica Crown on LinkedIn",
    Icon: FaLinkedinIn,
  },
];

const MENU_LINKS = [
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const navRef = useRef(null);
  // /work now renders the dark-background bee-flight page (WorkBee) -
  // the standalone /playground route it used to live at has been removed
  const isDark = pathname?.startsWith("/about") || pathname?.startsWith("/work");

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
      if (hidden) closeMenuRef.current?.();
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

  const menuRef = useRef(null);
  const glassRef = useRef(null);
  const panelRef = useRef(null);
  const menuTimeline = useRef(null);
  const menuBusy = useRef(false);
  const menuOpenRef = useRef(false);
  const closeMenuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // open: a thin bar grows LEFT from the trigger to the full menu width,
  // then the panel drops DOWN from the bar's bottom edge (height animates
  // from a fixed top edge, never scaled from the center), then the links
  // and circles reveal. Close plays the same timeline backwards, so content
  // retracts first, the panel lifts, and the bar pulls back to the trigger.
  function openMenu() {
    const menu = menuRef.current;
    const glass = glassRef.current;
    const panel = panelRef.current;
    if (!menu || !glass || !panel || menuBusy.current || menuOpenRef.current) return;

    menuBusy.current = true;
    menuOpenRef.current = true;
    setMenuOpen(true);

    menuTimeline.current?.kill();
    const items = panel.querySelectorAll(".nav-menu-reveal");
    const circles = panel.querySelectorAll(".nav-menu-circle");
    const trigger = menu.querySelector(".nav-menu-trigger");

    // the trigger and the dropdown are ONE glass surface: a single
    // rectangle that starts as the trigger's square, widens to the full
    // menu width, then drops to full height. The moving light lives inside
    // it at full-menu size, so the glass simply uncovers more of it.
    const startSize = trigger.offsetWidth;
    const fullWidth = menu.offsetWidth;
    const fullHeight = startSize + panel.offsetHeight + 2;
    menu.style.setProperty("--menu-full-h", fullHeight + "px");

    gsap.set(panel, { visibility: "visible" });
    gsap.set(glass, { width: startSize, height: startSize });
    gsap.set(items, { yPercent: 110 });
    gsap.set(circles, { scale: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        menuBusy.current = false;
      },
      onReverseComplete: () => {
        gsap.set(panel, { visibility: "hidden" });
        gsap.set(glass, { clearProps: "width,height" });
        menuOpenRef.current = false;
        menuBusy.current = false;
        setMenuOpen(false);
      },
    });
    tl.to(glass, { width: fullWidth, duration: 0.5, ease: "power3.inOut" })
      .to(glass, { height: fullHeight, duration: 0.65, ease: "power4.out" }, ">-0.04")
      .to(items, { yPercent: 0, duration: 0.5, stagger: 0.06, ease: "power3.out" }, "-=0.4")
      .to(circles, { scale: 1, duration: 0.5, stagger: 0.08, ease: "back.out(1.6)" }, "<0.15");
    menuTimeline.current = tl;
  }

  function closeMenu() {
    const tl = menuTimeline.current;
    if (!tl || menuBusy.current || !menuOpenRef.current) return;
    menuBusy.current = true;
    tl.timeScale(1.35).reverse();
  }
  closeMenuRef.current = closeMenu;

  function toggleMenu() {
    if (menuOpenRef.current) closeMenu();
    else openMenu();
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") closeMenuRef.current?.();
    }
    function onPointerDown(event) {
      if (menuOpenRef.current && !menuRef.current?.contains(event.target)) {
        closeMenuRef.current?.();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      menuTimeline.current?.kill();
    };
  }, []);

  const liveParticles = useRef(0);
  const layerRef = useRef(null);
  const burstTimelines = useRef(new Set());

  // clean up any in-flight particles if the navbar unmounts
  useEffect(() => {
    const timelines = burstTimelines.current;
    return () => {
      timelines.forEach((tl) => tl.kill());
      timelines.clear();
      layerRef.current?.remove();
      layerRef.current = null;
      liveParticles.current = 0;
    };
  }, []);

  // clicking the logo bursts small copies of the crown out of its real
  // position; the click is left to bubble so Link navigation is untouched
  function handleLogoClick(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (liveParticles.current + BURST_COUNT > MAX_LIVE_PARTICLES) return;

    const logo = event.currentTarget.querySelector("img");
    if (!logo) return;
    const box = logo.getBoundingClientRect();
    if (!box.width) return;

    if (!layerRef.current) {
      const layer = document.createElement("div");
      layer.setAttribute("aria-hidden", "true");
      layer.className = "crown-burst-layer";
      document.body.appendChild(layer);
      layerRef.current = layer;
    }
    const layer = layerRef.current;

    const crownW = box.width * CROWN_RECT.width;
    const crownH = box.height * CROWN_RECT.height;
    const originX = box.left + box.width * CROWN_RECT.left + crownW / 2;
    const originY = box.top + box.height * CROWN_RECT.top + crownH / 2;
    const spread = Math.max(crownW, 60);
    const brush = CustomEase.create("crownBrush", "M0,0 C0.1,0.6 0.25,1 1,1");

    for (let i = 0; i < BURST_COUNT; i++) {
      const el = document.createElement("img");
      el.src = "/logo/CROWN.svg";
      el.alt = "";
      el.draggable = false;
      el.className = "crown-particle";
      gsap.set(el, {
        width: crownW,
        left: originX - crownW / 2,
        top: originY - crownH / 2,
        scale: gsap.utils.random(0.7, 1.3),
        rotation: gsap.utils.random(-25, 25),
        opacity: 0,
        filter: isDark ? "invert(1)" : "none",
      });
      layer.appendChild(el);
      liveParticles.current++;

      const side = i % 2 ? 1 : -1;
      const angle = gsap.utils.random(-35, 55) * (Math.PI / 180);
      const reach = gsap.utils.random(0.5, 1.5) * spread;
      const dx = side * Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach * 0.6;
      const fall = gsap.utils.random(70, 190);
      const spin = gsap.utils.random(-140, 140);

      const tl = gsap.timeline({
        delay: i * 0.012,
        onComplete: () => {
          burstTimelines.current.delete(tl);
          el.remove();
          liveParticles.current--;
        },
      });
      burstTimelines.current.add(tl);
      tl.to(el, { opacity: 1, duration: 0.08, ease: "none" }, 0)
        .to(
          el,
          { x: dx, y: dy, rotation: `+=${spin * 0.4}`, duration: 0.42, ease: brush },
          0
        )
        .to(
          el,
          {
            x: dx * 1.25,
            y: dy + fall,
            rotation: `+=${spin * 0.6}`,
            duration: gsap.utils.random(0.7, 1.05),
            ease: "power2.in",
          },
          0.42
        )
        .to(el, { opacity: 0, duration: 0.35, ease: "power1.in" }, ">-0.4");
    }
  }

  return (
    <nav className={isDark ? "nav-dark" : ""} ref={navRef}>
      <div className="nav-logo">
        <Link
          href="/"
          aria-label="Creatica Crown home"
          onClick={handleLogoClick}
        >
          <img src="/logo/LOGO.svg" alt="Creatica Crown" />
        </Link>
      </div>

      <p className="nav-tagline">Creative Marketing Agency</p>

      <div className="nav-menu" ref={menuRef}>
        <div className="nav-menu-glass" ref={glassRef}>
          <div className="nav-menu-light" aria-hidden="true">
            <i className="nav-menu-blob nav-menu-blob-a" />
            <i className="nav-menu-blob nav-menu-blob-b" />
            <i className="nav-menu-blob nav-menu-blob-c" />
            <i className="nav-menu-blob nav-menu-blob-swirl" />
            <i className="nav-menu-edge" />
          </div>
          <div
            className="nav-menu-panel"
            id="nav-menu-panel"
            ref={panelRef}
            inert={!menuOpen}
          >
            <div className="nav-menu-inner">
              <ul className="nav-menu-list">
                {MENU_LINKS.map((link) => (
                  <li key={link.href} className="nav-menu-item">
                    <Link
                      href={link.href}
                      className="nav-menu-link"
                      onClick={closeMenu}
                      {...scrambleHoverProps}
                    >
                      <span className="nav-menu-reveal">
                        <span className="scramble-target">{link.label}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="nav-menu-circles">
                {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                  <a
                    key={href}
                    className="nav-menu-circle"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                  >
                    <Icon className="nav-menu-social-icon" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="nav-menu-trigger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="nav-menu-panel"
          onClick={toggleMenu}
        >
          <span className="nav-menu-dice" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </button>
      </div>
    </nav>
  );
}
