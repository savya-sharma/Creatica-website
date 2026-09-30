import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.registerPlugin(ScrambleTextPlugin);

const SCRAMBLE_CHARS = "@#$%^&*";

// links that carry a decorative icon/arrow alongside their label (e.g. the
// footer CTA button) mark just the label with this class, so the scramble
// only ever rewrites that span's innerHTML - never the icon, and never the
// parent <a>/<Link>/<button> itself, which would risk stripping Next.js's
// own click handling
function resolveTarget(root) {
  return root.querySelector(".scramble-target") || root;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// only trusts the DOM's current text as the "original" when nothing is
// mid-scramble - guards against caching a half-randomized string if the
// user re-hovers before the previous cycle finished settling
function getOriginalText(el) {
  const tween = el._scrambleTween;
  const isMidFlight = !!(tween && tween.isActive());
  if (!isMidFlight) {
    el.dataset.scrambleOriginal = el.textContent;
  }
  return el.dataset.scrambleOriginal;
}

// low-level primitive: scrambles `el`'s content to `text`. Exported so
// callers that need to change an element's text under their own control
// (e.g. swapping to a "Copied" confirmation) can drive it through GSAP
// instead of React, since once GSAP starts writing this element's
// innerHTML directly, mixing in React-rendered children for the same node
// stops updating reliably
export function scrambleTo(el, text, { duration = 0.6 } = {}) {
  if (!el) return null;

  if (prefersReducedMotion()) {
    el.textContent = text;
    el.dataset.scrambleOriginal = text;
    return null;
  }

  el._scrambleTween?.kill();
  el.dataset.scrambleOriginal = text;
  el._scrambleTween = gsap.to(el, {
    duration,
    ease: "power1.out",
    scrambleText: {
      text,
      chars: SCRAMBLE_CHARS,
      speed: 0.7,
      revealDelay: 0.05,
      oldClass: "scramble-char",
    },
  });
  return el._scrambleTween;
}

function scrambleIn(e) {
  if (prefersReducedMotion()) return;
  // a tap is not a hover: on touch the scramble would only start as the
  // tap navigates/activates, reading as a glitch rather than feedback
  if (e.pointerType === "touch") return;

  const el = resolveTarget(e.currentTarget);
  scrambleTo(el, getOriginalText(el));
}

// keyboard focus gets the same feedback as a hover - but not the focus a
// mouse click causes, which the pointerenter has already animated
function scrambleFocus(e) {
  if (!e.currentTarget.matches(":focus-visible")) return;
  scrambleIn(e);
}

function scrambleOut(e) {
  if (prefersReducedMotion()) return;

  const el = resolveTarget(e.currentTarget);
  const tween = el._scrambleTween;
  // if it already finished, it's showing the right text - nothing to do.
  // if it's still running, gently speed it up so it settles sooner instead
  // of cutting it off abruptly
  if (tween && tween.isActive()) {
    gsap.to(tween, { timeScale: 3, duration: 0.2, overwrite: true });
  }
}

export const scrambleHoverProps = {
  onPointerEnter: scrambleIn,
  onPointerLeave: scrambleOut,
  onFocus: scrambleFocus,
  onBlur: scrambleOut,
};
