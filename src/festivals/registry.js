// The festival registry: which festivals the site celebrates, and when.
// A festival is active on the days of its window (inclusive, India time).
// When none is active nothing festive is mounted and the site is exactly its
// default self. Remove an entry (and its folder) to retire a festival.

export const FESTIVALS = [
  {
    id: "diwali",
    name: "Diwali",
    // Dhanteras to Bhai Dooj, 2026 (Lakshmi Puja on 8 Nov) - TO CONFIRM
    // against a panchang before launch
    start: "2026-11-06",
    end: "2026-11-11",
    // overrides for the site's own shader systems while the festival is on -
    // each is merged over that system's config when it starts (theme.js),
    // so with no festival they run on exactly their own config
    // (remove a key to leave that system on its own look)
    theme: {
      // page transition: a Diwali night - charcoal, soft areas of burnished
      // bronze, a saffron edge of lamplight
      transition: { color: "#16110e", color2: "#3b2a14", twoTone: 0.6, rimColor: "#f4a300" },
      // loader: its own scene (festivals/loaderScenes.js) - a lit diya in a
      // charcoal night, a gold rangoli drawing itself round it with the
      // count, sparks rising; then the flame flares and the dark opens into
      // the hero. It emerges from the overlay's own colour, so nothing pops
      loader: { scene: "diwali", emergeDuration: 1.1, revealDuration: 2.4, revealEase: "power2.inOut" },
      // cursor ink: warm gold to saffron instead of white
      cursorInk: { colorA: "#f2d27a", colorB: "#ffb347" },
    },
    // which pieces of the composition show (false hides one everywhere)
    decorations: {
      mandala: true, // the hero centrepiece, at the right edge
      diyas: true, // the two small lamps after the headline (with glow and embers)
      marigold: true, // the marigold clusters along the hero's edges (still, no rotation)
      ornament: true, // the eave with its two hanging lanterns (tablet and up)
      bloom: true, // the lanterns' light spilling into the air round them
      footerOrnament: true, // the hanging lantern in the footer
    },
    // the composition's motion (diwali/motion.js) - all of it, in one place
    motion: {
      enabled: true, // false: the art simply appears, still
      // the rangoli: an iris reveal from its centre once the loader opens,
      // then an extremely slow turn (paused while the hero is off screen)
      mandalaReveal: 2.6, // seconds
      mandalaTurn: 420, // seconds per full turn (0 = still)
      mandalaParallax: 0.05, // share of its size it drifts up as the hero scrolls away
      // the diyas: settle in, float a few pixels, flames flicker softly and
      // lean a little from a nearby pointer / finger
      diyaFloat: 3, // px
      flameFlicker: 0.14, // how much a flame breathes (scale)
      proximityRadius: 170, // px around a diya the pointer affects
      proximityLean: 5, // px a diya and its flame lean, at most
      // the small pieces
      entranceStagger: 0.14, // seconds between pieces arriving
      ornamentSway: 1.8, // degrees a hanging lantern swings
      // the lanterns' light (diwali/bloom.js and the glow in their glass)
      lanternFlicker: 0.08, // how much it breathes
      // footer: the hanging lantern arrives as the footer scrolls in
      footerEntrance: 1.2, // seconds
      // golden embers rising from the flames (a small local canvas), nudged
      // by the pointer's movement nearby
      embers: 5, // per flame per second (0 = none)
      emberPush: 0.6, // how strongly pointer movement carries them
    },
  },
];

export const FESTIVAL_SETTINGS = {
  timeZone: "Asia/Kolkata",
  // ?festival=diwali previews a festival on any date, ?festival=none forces
  // the default, ?festival=auto returns to the calendar; remembered for the
  // browser session. Development builds only, unless enabled here.
  previewInProduction: false,
  // ?festivalGuides=1 (development only; =0 turns it off, remembered for the
  // session) outlines where each artwork asset sits - labelled boxes for
  // assets not supplied yet - to check the layout
  guidesInDevelopment: true,
};
