"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import ClientSocialLinks from "./ClientSocialLinks";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// One client in the directory: a numbered row that opens to show the
// client's profiles. The row is a real button (aria-expanded / controls);
// the panel below it opens and closes with a short GSAP height tween (at
// once with reduced motion) and is inert while closed, so its links are
// never tabbed into unseen.
export default function ClientDirectoryItem({ client, index, open, onToggle }) {
  const panelRef = useRef(null);
  const first = useRef(true);
  const panelId = `client-panel-${client.id}`;
  const triggerId = `client-trigger-${client.id}`;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    // the first render just sets the closed state - nothing to animate
    if (first.current) {
      first.current = false;
      gsap.set(panel, { height: open ? "auto" : 0 });
      return undefined;
    }
    const still = reducedMotion();
    const links = panel.querySelectorAll(".client-link, .client-links-empty");
    if (open) {
      gsap.to(panel, { height: "auto", duration: still ? 0 : 0.55, ease: "power3.out", overwrite: true });
      if (!still) gsap.fromTo(links, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.06, delay: 0.12 });
    } else {
      gsap.to(panel, { height: 0, duration: still ? 0 : 0.42, ease: "power2.inOut", overwrite: true });
    }
    return () => gsap.killTweensOf(links);
  }, [open]);

  return (
    <li className={`client-item${open ? " is-open" : ""}`} data-reveal>
      <h3 className="client-heading">
        <button
          type="button"
          id={triggerId}
          className="client-trigger no-select"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="client-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="client-name">{client.name}</span>
          <span className="client-toggle" aria-hidden="true" />
        </button>
      </h3>
      <div className="client-panel" id={panelId} role="region" aria-labelledby={triggerId} ref={panelRef} inert={!open}>
        <div className="client-panel-inner">
          <ClientSocialLinks name={client.name} socials={client.socials} />
        </div>
      </div>
    </li>
  );
}
