"use client";

import { useSyncExternalStore } from "react";
import { FESTIVALS, FESTIVAL_SETTINGS } from "./registry";
import { dateIn, selectFestival, validFestivals } from "./select";

// The active festival for this browser tab, as a tiny store: resolved from
// the registry's dates (India time) and, in development, the preview; kept
// current while the page is open (re-checked when the tab comes back into
// view, so a window opening or closing overnight takes effect) and when the
// preview changes. Subscribers - the decoration slots, the cursor ink, the
// page transition - mount, restore or clean up live.
//
// Preview: ?festival=<id> | none | auto, remembered for the session -
// development builds only unless FESTIVAL_SETTINGS.previewInProduction. A
// production build never reads or writes the preview.

const PREVIEW_KEY = "cc-festival-preview";
const GUIDES_KEY = "cc-festival-guides";
const DEV = process.env.NODE_ENV !== "production";
const PREVIEW_ON = DEV || FESTIVAL_SETTINGS.previewInProduction;

const SERVER_STATE = Object.freeze({ festival: null, guides: false });
let state = null;
const listeners = new Set();

function readSession(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function writeSession(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // storage blocked: the preview lasts for this page only
  }
}

// the URL's ?festival / ?festivalGuides, remembered for the session
function absorbUrl() {
  if (!PREVIEW_ON) return;
  const params = new URLSearchParams(window.location.search);
  const festival = params.get("festival");
  if (festival === "auto") writeSession(PREVIEW_KEY, null);
  else if (festival) writeSession(PREVIEW_KEY, festival);
  const guides = params.get("festivalGuides");
  if (DEV && FESTIVAL_SETTINGS.guidesInDevelopment) {
    if (guides === "1") writeSession(GUIDES_KEY, "1");
    else if (guides === "0") writeSession(GUIDES_KEY, null);
  }
}

function compute() {
  const preview = PREVIEW_ON ? readSession(PREVIEW_KEY) : null;
  return {
    festival: selectFestival({ festivals: FESTIVALS, date: dateIn(FESTIVAL_SETTINGS.timeZone), preview }),
    guides: DEV && FESTIVAL_SETTINGS.guidesInDevelopment && readSession(GUIDES_KEY) === "1",
  };
}

function refresh() {
  const next = compute();
  if (state && next.festival === state.festival && next.guides === state.guides) return;
  state = next;
  listeners.forEach((listener) => listener());
}

function init() {
  if (state) return;
  absorbUrl();
  state = compute();
  if (DEV) {
    const { problems } = validFestivals(FESTIVALS);
    if (problems.length) console.warn("[festivals] skipped:", problems.join("; "));
    // development handle: inspect or switch the festival from the console
    window.__festival = {
      get: () => state,
      preview: setFestivalPreview,
    };
  }
  // the date may have crossed a festival's start or end while away
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
}

/** { festival, guides } now (client), resolving on first use. */
export function getFestivalState() {
  if (typeof window === "undefined") return SERVER_STATE;
  init();
  return state;
}

/** The active festival's id, or null. */
export function getFestival() {
  return getFestivalState().festival;
}

/** Calls `listener` whenever the active festival (or guides) change. */
export function onFestivalChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Development preview: a festival id, "none" (forced off) or "auto" (back to
 * the calendar). No effect in production unless previewInProduction is set.
 */
export function setFestivalPreview(value) {
  if (!PREVIEW_ON) return;
  writeSession(PREVIEW_KEY, value === "auto" ? null : value);
  refresh();
}

/**
 * { festival, guides } for this tab. null/false during the server render and
 * hydration (so the markup matches), then live.
 */
export function useFestival() {
  return useSyncExternalStore(onFestivalChange, getFestivalState, () => SERVER_STATE);
}
