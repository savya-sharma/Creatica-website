"use client";

import { useLayoutEffect, useRef } from "react";
import { animateFooter } from "./motion";
import Sticker from "./Sticker";
import "./diwali.css";

// The footer's Diwali signature (FestivalSlot area="footer"): a hanging
// lantern at the right of its top edge, on desktop, arriving with one
// settling swing as the footer scrolls into view (motion.js).
export default function DiwaliFooter({ guides, motion, decorations = {} }) {
  const rootRef = useRef(null);
  useLayoutEffect(() => (rootRef.current ? animateFooter(rootRef.current, motion) : undefined), [motion, guides]);
  return (
    <div className="diwali-footer" ref={rootRef} aria-hidden="true">
      {decorations.footerOrnament !== false && (
        <Sticker id="diwali-lantern" className="diwali-footer-lantern" sizes="5rem" guides={guides} />
      )}
    </div>
  );
}
