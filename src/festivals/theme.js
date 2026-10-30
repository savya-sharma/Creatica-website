import { FESTIVALS } from "./registry";
import { getFestival } from "./useFestival";
import { festivalTheme as themeFor, mergeTheme } from "./select";

// The active festival's overrides for one of the site's shader systems
// ("transition", "loader", "cursorInk"), merged over that system's own
// config. Client only; with no festival (or no override for that system)
// the base config object itself is returned, so the system runs exactly as
// it always has.
export function withFestival(base, system) {
  if (typeof window === "undefined") return base;
  return mergeTheme(base, FESTIVALS, getFestival(), system);
}

/** The overrides one festival sets for one system, or null. */
export function festivalTheme(festivalId, system) {
  return themeFor(FESTIVALS, festivalId, system);
}
