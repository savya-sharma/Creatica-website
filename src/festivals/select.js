// Festival selection and theme merging - pure functions, no browser access,
// so they can be unit-tested (select.test.mjs). The browser side (today's
// date, the preview in session storage, change notifications) is in
// useFestival.js.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// a real calendar date written YYYY-MM-DD (rejects 2026-02-30, 2026-13-01...)
export function isValidDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * The usable festivals, and why any others were skipped. A festival needs an
 * id and a valid start <= end; anything else is ignored rather than breaking
 * the site (so a bad entry can only ever mean "no festival").
 */
export function validFestivals(festivals) {
  const valid = [];
  const problems = [];
  const seen = new Set();
  for (const f of Array.isArray(festivals) ? festivals : []) {
    const id = f?.id;
    if (typeof id !== "string" || !id) problems.push("a festival without an id");
    else if (seen.has(id)) problems.push(`"${id}" is listed twice`);
    else if (!isValidDate(f.start) || !isValidDate(f.end)) problems.push(`"${id}" has an invalid start or end date`);
    else if (f.start > f.end) problems.push(`"${id}" ends before it starts`);
    else {
      seen.add(id);
      valid.push(f);
      continue;
    }
  }
  return { valid, problems };
}

/** Today's date in a time zone, as YYYY-MM-DD. */
export function dateIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The active festival's id, or null.
 *   preview "none"         -> null (festivals forced off)
 *   preview "<valid id>"   -> that festival, whatever the date
 *   anything else          -> the festival whose window contains `date`
 * Windows are inclusive; the first matching festival wins.
 */
export function selectFestival({ festivals, date, preview = null }) {
  const { valid } = validFestivals(festivals);
  if (preview === "none") return null;
  if (preview && valid.some((f) => f.id === preview)) return preview;
  if (!isValidDate(date)) return null;
  return valid.find((f) => date >= f.start && date <= f.end)?.id ?? null;
}

/** The overrides a festival sets for one system ("transition", ...), or null. */
export function festivalTheme(festivals, festivalId, system) {
  if (!festivalId) return null;
  const theme = validFestivals(festivals).valid.find((f) => f.id === festivalId)?.theme?.[system];
  return theme && typeof theme === "object" ? theme : null;
}

/**
 * A system's config with the festival's overrides on top. With no festival
 * (or no override) the base object itself is returned - not a copy - so the
 * default state is exactly the original config.
 */
export function mergeTheme(base, festivals, festivalId, system) {
  const theme = festivalTheme(festivals, festivalId, system);
  return theme ? { ...base, ...theme } : base;
}
