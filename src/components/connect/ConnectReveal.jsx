"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onPreloaderDone } from "@/lib/preloader";

gsap.registerPlugin(ScrollTrigger);

// A quiet entrance for /connect: everything marked data-reveal rises a few
// pixels into place as it scrolls into view (in a short stagger), once the
// entry loader has opened. Nothing is hidden without JavaScript or with
// reduced motion - the hidden start is set here, never in CSS.
export default function ConnectReveal({ children }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const items = root.querySelectorAll("[data-reveal]");
    let unsubscribe = () => {};
    const ctx = gsap.context(() => {
      gsap.set(items, { autoAlpha: 0, y: 18 });
      unsubscribe = onPreloaderDone(() =>
        ctx.add(() => {
          ScrollTrigger.batch(items, {
            start: "top 92%",
            once: true,
            onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 }),
          });
        }),
      );
    }, root);
    return () => {
      unsubscribe();
      ctx.revert();
    };
  }, []);

  return (
    <div className="connect-reveal" ref={rootRef}>
      {children}
    </div>
  );
}
