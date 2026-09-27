"use client";

import { useLayoutEffect, useState } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { markPreloaderDone } from "@/lib/preloader";
import { onLenisReady } from "@/lib/lenis";

gsap.registerPlugin(Flip);

const LOGO_SRC = "/logo/LOGO.svg";

// (the reference's SplitText hero-copy helper is unused there - the copy
// reveal is commented out as "optional" - so SplitText is not registered)
const snapToOdd = (value) => (value % 2 === 0 ? value - 1 : value);

// The reference preloader, as a React component:
//   .preloader
//     .preloader-bg
//     .preloader-grid
//     .progress-marker
//
// The maths, colours, stops, timeline positions and eases are the
// reference's. Differences are only what React/Next need: everything
// DOM-dependent runs after mount, the generated DOM and the timeline are
// cleaned up on unmount (Strict Mode safe), the tile/marker positions are
// measured once instead of on every hop, the logo path is the real public
// path, and the element leaves the tree once the timeline finishes.
//
// This plays on every real document load/reload and never on a Next.js
// client-side navigation, with no sessionStorage/localStorage involved -
// the distinction falls out for free from where the component lives and
// how the App Router works: RootLayout (and this component inside it) is
// mounted exactly once per real page load and stays mounted across
// client-side route changes (that's what "layout" means in the App
// Router), so this mount effect - and the module load that resets
// `mounted`'s initial value to true - can only ever happen again on an
// actual new document: a fresh tab, a hard reload, or a back/forward that
// the browser served from a real reload rather than the client router.
//
// The element's own visibility needs no JS or attribute at all: see the
// unconditional .preloader rule in globals.css, which covers the viewport
// (with its own opaque background) straight from the server-rendered
// HTML, before any script runs - so the Hero underneath can never be
// painted first, hydration-timing or not.
export default function Preloader() {
  const [mounted, setMounted] = useState(true);

  useLayoutEffect(() => {
    const html = document.documentElement;
    const preloader = document.querySelector(".preloader");
    if (!preloader) return undefined;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markPreloaderDone();
      setMounted(false);
      return undefined;
    }

    html.classList.add("preloader-lock");

    // ---- scroll lock ----------------------------------------------------
    // Blocks wheel/touch/keyboard scrolling directly, rather than fighting
    // it every frame by repeatedly forcing scrollTo(0, 0), and pauses
    // Lenis's own handling for the same span so nothing - native or
    // Lenis-smoothed - can move the page while the loader is up. Wheel and
    // touchmove need { passive: false } to be allowed to preventDefault();
    // keydown only blocks the keys that page-scroll, and leaves them alone
    // whenever an actual editable element has focus.
    const SCROLL_KEYS = new Set([
      " ",
      "Spacebar",
      "PageDown",
      "PageUp",
      "End",
      "Home",
      "ArrowDown",
      "ArrowUp",
    ]);
    const isEditable = (el) =>
      !!el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const blockWheel = (event) => event.preventDefault();
    const blockTouchMove = (event) => event.preventDefault();
    const blockScrollKeys = (event) => {
      if (SCROLL_KEYS.has(event.key) && !isEditable(document.activeElement)) {
        event.preventDefault();
      }
    };
    window.addEventListener("wheel", blockWheel, { passive: false });
    window.addEventListener("touchmove", blockTouchMove, { passive: false });
    window.addEventListener("keydown", blockScrollKeys);

    let lockedLenis = null;
    const unsubscribeLenisReady = onLenisReady((lenis) => {
      lockedLenis = lenis;
      lenis.stop();
    });

    let scrollLockReleased = false;
    function releaseScrollLock() {
      if (scrollLockReleased) return;
      scrollLockReleased = true;
      window.removeEventListener("wheel", blockWheel);
      window.removeEventListener("touchmove", blockTouchMove);
      window.removeEventListener("keydown", blockScrollKeys);
      // cancels the subscription if Lenis still hasn't mounted by now,
      // so it can never arrive "stopped" after the lock has already lifted
      unsubscribeLenisReady();
      lockedLenis?.start();
      html.classList.remove("preloader-lock");
    }

    // .preloader's own CSS background-color is only a pre-JS safety net -
    // it's what covers the viewport in the first painted frame, before this
    // effect has even run, so the Hero can never flash first. The instant
    // this effect DOES run, that job is handed off entirely to the
    // preloader-bg element below: .preloader itself goes transparent right
    // here, so that later removing preloader-bg (part of the timeline, not
    // a separate fade) leaves nothing grey behind it - only the individual
    // tiles, which the Hero shows through the moment each one collapses,
    // rather than a flat colour surviving underneath all of them.
    preloader.style.backgroundColor = "transparent";

    const preloaderBg = document.createElement("div");
    preloaderBg.className = "preloader-bg";
    const preloaderGrid = document.createElement("div");
    preloaderGrid.className = "preloader-grid";
    const progressMarker = document.createElement("div");
    progressMarker.className = "progress-marker";
    const initialLabel = document.createElement("p");
    initialLabel.textContent = "25";
    progressMarker.appendChild(initialLabel);
    preloader.append(preloaderBg, preloaderGrid, progressMarker);

    // ---- grid ---------------------------------------------------------
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDesktop = vw >= 1000;
    const maxTileSize = isDesktop ? 85 : 50;

    // Math.max only guards a degenerate viewport from a 0/negative count
    const columnCount = Math.max(1, snapToOdd(Math.floor(vw / maxTileSize)));
    const rowCount = Math.max(1, snapToOdd(Math.floor(vh / maxTileSize)));

    const tileSize = Math.min(vw / columnCount, vh / rowCount);

    const totalColumns = columnCount + 2;
    const totalRows = rowCount + 2;

    preloaderGrid.style.width = `${totalColumns * tileSize}px`;
    preloaderGrid.style.height = `${totalRows * tileSize}px`;

    const tiles = [];
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalColumns * totalRows; i++) {
      const tile = document.createElement("div");
      tile.classList.add("grid-tile");
      tile.style.width = `${tileSize}px`;
      tile.style.height = `${tileSize}px`;
      fragment.appendChild(tile);
      tiles.push(tile);
    }
    preloaderGrid.appendChild(fragment);

    const middleRow = Math.floor(totalRows / 2);
    const centerColumn = Math.floor(totalColumns / 2);
    const tileAtColumn = (column) => tiles[middleRow * totalColumns + column];

    // the four blocks the marker visits, offset from the centre column
    // (tighter on mobile)
    const firstStep = tileAtColumn(centerColumn - (isDesktop ? 5 : 2));
    const secondStep = tileAtColumn(centerColumn + (isDesktop ? 3 : 1));
    const thirdStep = tileAtColumn(centerColumn + (isDesktop ? 5 : 2));
    const finalStep = tileAtColumn(centerColumn);

    // the stops start white
    const markerStops = [firstStep, secondStep, thirdStep, finalStep];
    markerStops.forEach((tile) => {
      tile.style.backgroundColor = "#fff";
      tile.style.outline = "0.5px solid #fff";
    });

    // every other block starts transparent and is faded in
    const fadeInTiles = tiles.filter((tile) => !markerStops.includes(tile));

    // measured once: the preloader and each stop (the reference re-measured
    // the stop on every hop)
    const preloaderRect = preloader.getBoundingClientRect();
    const offsets = new Map();
    markerStops.forEach((tile) => {
      const tileRect = tile.getBoundingClientRect();
      offsets.set(tile, {
        left: tileRect.left - preloaderRect.left,
        top: tileRect.top - preloaderRect.top,
      });
    });

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      // pointer events off first, then the element leaves the tree
      preloader.style.pointerEvents = "none";
      // one-time correction, not a per-frame fight: scrolling was fully
      // blocked for the loader's entire run, so this should already be a
      // no-op, but guarantees Hero is what greets the user at scrollY 0.
      // Done before Lenis restarts, then again through Lenis itself right
      // after, so its own internal position tracking - not just the
      // native scrollY - agrees exactly with 0 too, and doesn't have a
      // stale target to interpolate away from on the next input.
      window.scrollTo(0, 0);
      const lenis = lockedLenis;
      releaseScrollLock();
      lenis?.scrollTo(0, { immediate: true });
      markPreloaderDone();
      setMounted(false);
    }

    const ctx = gsap.context(() => {
      gsap.set(fadeInTiles, { opacity: 0 });
      gsap.set(progressMarker, { width: tileSize, height: tileSize });
      gsap.set(progressMarker, offsets.get(firstStep));

      // slides the marker from block to block: Flip records where it is,
      // the new offset is applied, Flip animates the difference. Returns
      // the Flip tween so callers that need to know exactly when the move
      // finishes (not just when it starts) can hook its completion.
      function moveMarkerTo(tile, makeLabel) {
        const startState = Flip.getState(progressMarker);
        gsap.set(progressMarker, offsets.get(tile));
        progressMarker.replaceChildren(makeLabel());
        return Flip.from(startState, { duration: 1, ease: "power1.out" });
      }

      const numberLabel = (text) => () => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
      };
      const logoLabel = () => {
        const img = document.createElement("img");
        img.src = LOGO_SRC;
        img.alt = "";
        img.decoding = "async";
        return img;
      };

      const timeline = gsap.timeline({ delay: 1, onComplete: finish });

      // the blocks light up scattered across the grid
      timeline.to(
        fadeInTiles,
        {
          opacity: 1,
          duration: 0.125,
          stagger: { each: 2.5 / fadeInTiles.length, from: "random" },
        },
        0
      );

      // the first three stops turn slate-green, matching the grid tiles
      timeline.to(
        [firstStep, secondStep, thirdStep],
        {
          backgroundColor: "#586A6B",
          outlineColor: "#586A6B",
          stagger: 0.25,
        },
        2.75
      );

      // the marker travels three steps, each pinned to its own time
      timeline.add(() => moveMarkerTo(secondStep, numberLabel("50")), 0.25);
      timeline.add(() => moveMarkerTo(thirdStep, numberLabel("75")), 1.5);
      timeline.addLabel("logoIn", 2.75);
      // this last move's own Flip tween runs independently of the parent
      // timeline (it's created live, mid-playback, not a child the
      // timeline's own duration accounts for), so the timeline is paused
      // for its exact real duration and only resumed on its own
      // onComplete - the collapse below genuinely cannot start until the
      // marker has actually finished arriving, not just started arriving,
      // regardless of the Flip's own duration/ease ever changing later
      timeline.add(() => {
        timeline.pause();
        moveMarkerTo(finalStep, logoLabel).eventCallback("onComplete", () => timeline.play());
      }, "logoIn");

      // explicit positions from here on, all keyed off the "logoIn" label:
      // the green-tint tween just above this has no explicit duration (so
      // it takes GSAP's own 0.5s default) and stretches past 2.75 on its
      // own, which - left to sequence off "wherever the timeline happens to
      // end" - was quietly pushing the background removal and the collapse
      // roughly a second later than intended
      timeline.add(() => preloaderBg.remove(), "logoIn");

      const collapsingTiles = tiles.filter((tile) => tile !== finalStep);

      timeline.to(
        collapsingTiles,
        {
          scaleY: 0,
          transformOrigin: "top",
          duration: 0.75,
          stagger: { each: 0.0035, from: "random" },
          ease: "power3.out",
        },
        "logoIn+=0.5"
      );

      // the grid peels away block by block; the centre stop is handled
      // separately, with the marker
      timeline.to(
        [finalStep, progressMarker],
        { scaleY: 0, transformOrigin: "top", duration: 0.75, ease: "power3.out" },
        "<"
      );
    }, preloader);

    return () => {
      // unmount / Strict Mode re-run: timeline killed, scroll lock
      // released, everything reverted, generated DOM removed
      finished = true;
      releaseScrollLock();
      ctx.revert();
      preloaderBg.remove();
      preloaderGrid.remove();
      progressMarker.remove();
    };
  }, []);

  if (!mounted) return null;
  return <div className="preloader" aria-hidden="true" />;
}
