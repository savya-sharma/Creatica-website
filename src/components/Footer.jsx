"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function Footer() {
  const logoRef = useRef(null);
  const pathname = usePathname();
  const isDark =
    pathname?.startsWith("/playground") || pathname?.startsWith("/about");

  useEffect(() => {
    const el = logoRef.current;
    if (!el) return;

    const BASE_SIZE = 100;

    const fit = () => {
      el.style.fontSize = `${BASE_SIZE}px`;
      const scale = window.innerWidth / el.scrollWidth;
      el.style.fontSize = `${BASE_SIZE * scale}px`;
    };

    // the custom font (mainfont) loads asynchronously; measuring before it's
    // ready fits against fallback-font metrics and leaves the wordmark
    // undersized once the real font swaps in
    document.fonts.ready.then(fit);
    fit();

    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <footer className={`site-footer${isDark ? " site-footer--dark" : ""}`}>
      <div className="footer-top">
        <div className="footer-social">
          <a href="#">Instagram</a>
          <a href="#">LinkedIn</a>
        </div>

        <div className="footer-email">
          <a href="mailto:Creaticacrown@gmail.com">Creaticacrown@gmail.com</a>
        </div>

        <div className="footer-year">
          <span>&copy;2026</span>
        </div>
      </div>

      <h2 className="footer-logo" ref={logoRef}>
        CreaticaCrown
      </h2>
    </footer>
  );
}
