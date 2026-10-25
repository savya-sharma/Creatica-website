"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TRANSITION_CONFIG } from "@/lib/pageTransition/config";
import { BlobTransition } from "@/lib/pageTransition/controller";

// Organic page transition for in-site navigation (root layout):
//
//   click a same-site link -> organic blobs grow from set points on the
//   screen and merge -> fully covered -> navigate -> wait until the new route
//   has rendered and its fonts and on-screen images are ready -> it opens
//   from the centre back out to the borders.
//
// Links keep working as before: a capturing click listener only calls
// preventDefault(), which next/link respects (it skips its own navigation)
// while the link's own onClick still runs. Back/forward can't be covered in
// advance, so the cover snaps on before the new page paints, then reveals.
// A click during a transition retargets it; a page that never arrives is
// revealed anyway after maxWaitMs. Off for reduced motion and without WebGL
// - navigation is then exactly as before.

const normalize = (path) => (path.length > 1 ? path.replace(/\/+$/, "") : path);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frames = (n) =>
  new Promise((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

// the incoming page is ready: committed and painted, web fonts in, and the
// images it shows on screen decoded (each capped by readyTimeoutMs)
async function pageReady(config) {
  await frames(2);
  const onScreen = Array.from(document.images).filter((img) => {
    if (img.complete) return false;
    const r = img.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  });
  await Promise.race([
    Promise.all([document.fonts?.ready, ...onScreen.map((img) => img.decode().catch(() => {}))]),
    wait(config.readyTimeoutMs),
  ]);
  await frames(1);
}

export default function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const stateRef = useRef(null);

  // route commits wake whoever is waiting for the new page
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.pathname = pathname;
    state.poke();
  }, [pathname]);

  useEffect(() => {
    const config = TRANSITION_CONFIG;
    if (!config.enabled) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let ctrl;
    try {
      ctrl = new BlobTransition(config);
    } catch {
      return undefined; // no WebGL: plain navigation
    }
    // development only: lets the transition be inspected from the console
    if (process.env.NODE_ENV !== "production") window.__pageTransition = ctrl;

    const state = {
      pathname: normalize(window.location.pathname),
      next: null, // { href, path, pop }
      running: false,
      waiters: new Set(),
      poke() {
        state.waiters.forEach((check) => check());
      },
    };
    stateRef.current = state;
    let disposed = false;

    // resolves when `done()` turns true (checked on every route commit and
    // every new request), after `ms`, or on unmount
    const until = (done, ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(finish, ms);
        function finish() {
          clearTimeout(timer);
          state.waiters.delete(check);
          resolve();
        }
        function check() {
          if (disposed || done()) finish();
        }
        state.waiters.add(check);
        check();
      });

    async function run() {
      state.running = true;
      while (state.next && !disposed) {
        if (!state.next.pop) {
          await ctrl.cover();
          if (disposed) return;
          // never navigate under a partial cover
          if (!ctrl.covered) continue;
        }
        const target = state.next;
        state.next = null;
        const coveredAt = performance.now();

        if (!target.pop) router.push(target.href);
        // the route has committed (or a newer request has come in)
        await until(() => normalize(state.pathname) === target.path || !!state.next, config.maxWaitMs);
        if (state.next || disposed) continue;

        await pageReady(config);
        await wait(Math.max(0, config.minCoverMs - (performance.now() - coveredAt)));
        if (state.next || disposed) continue;

        await ctrl.reveal();
      }
      state.running = false;
    }

    function request(target) {
      state.next = target;
      state.poke();
      // a new navigation stops a reveal mid-way (cover() then closes it back
      // up); a cover already growing just carries on
      if (ctrl.revealing) ctrl.interrupt();
      if (!state.running) run();
    }

    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      if ("noTransition" in link.dataset) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // same page (incl. hash-only changes): leave it to the browser / Next
      if (normalize(url.pathname) === normalize(window.location.pathname) && url.search === window.location.search) return;
      e.preventDefault();
      request({ href: url.pathname + url.search + url.hash, path: normalize(url.pathname), pop: false });
    }

    function onPopState() {
      const path = normalize(window.location.pathname);
      if (path === normalize(state.pathname)) return; // hash / same page
      ctrl.setCovered(); // before React paints the page it is going to
      request({ href: null, path, pop: true });
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      disposed = true;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      state.waiters.forEach((check) => check());
      stateRef.current = null;
      if (window.__pageTransition === ctrl) delete window.__pageTransition;
      ctrl.dispose();
    };
  }, [router]);

  return null;
}
