// Festival date selection and theme merging (select.js).
// Run: npm test   (Node's built-in test runner - no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateIn, isValidDate, mergeTheme, selectFestival, validFestivals } from "./select.js";
import { FESTIVALS } from "./registry.js";

const DIWALI = { id: "diwali", start: "2026-11-06", end: "2026-11-11", theme: { transition: { color: "#072f33" } } };
const HOLI = { id: "holi", start: "2027-03-03", end: "2027-03-04", theme: {} };
const LIST = [DIWALI, HOLI];

test("valid dates only", () => {
  assert.ok(isValidDate("2026-11-06"));
  for (const bad of ["2026-02-30", "2026-13-01", "26-11-06", "2026-11-6", "", null, undefined, 20261106]) {
    assert.equal(isValidDate(bad), false, String(bad));
  }
});

test("no festival outside every window", () => {
  assert.equal(selectFestival({ festivals: LIST, date: "2026-10-28" }), null);
  assert.equal(selectFestival({ festivals: LIST, date: "2026-11-12" }), null);
});

test("active within its window, both ends inclusive", () => {
  for (const date of ["2026-11-06", "2026-11-08", "2026-11-11"]) {
    assert.equal(selectFestival({ festivals: LIST, date }), "diwali", date);
  }
  assert.equal(selectFestival({ festivals: LIST, date: "2026-11-05" }), null);
});

test("preview shows a festival outside its window", () => {
  assert.equal(selectFestival({ festivals: LIST, date: "2026-10-28", preview: "diwali" }), "diwali");
  assert.equal(selectFestival({ festivals: LIST, date: "2026-11-08", preview: "holi" }), "holi");
});

test("preview 'none' turns festivals off inside a window", () => {
  assert.equal(selectFestival({ festivals: LIST, date: "2026-11-08", preview: "none" }), null);
});

test("an unknown preview is ignored - the calendar decides", () => {
  assert.equal(selectFestival({ festivals: LIST, date: "2026-11-08", preview: "nope" }), "diwali");
  assert.equal(selectFestival({ festivals: LIST, date: "2026-10-28", preview: "nope" }), null);
});

test("invalid or missing configuration never activates anything (and never throws)", () => {
  for (const festivals of [undefined, null, {}, "diwali", [null], [{}]]) {
    assert.equal(selectFestival({ festivals, date: "2026-11-08" }), null);
  }
  const broken = [
    { start: "2026-11-06", end: "2026-11-11" }, // no id
    { id: "backwards", start: "2026-11-11", end: "2026-11-06" },
    { id: "bad-date", start: "2026-11-31", end: "2026-12-02" },
  ];
  assert.equal(selectFestival({ festivals: broken, date: "2026-11-08" }), null);
  assert.equal(selectFestival({ festivals: broken, date: "2026-11-08", preview: "backwards" }), null);
  assert.equal(selectFestival({ festivals: LIST, date: "not-a-date" }), null);
  const { valid, problems } = validFestivals([...broken, DIWALI, DIWALI]);
  assert.deepEqual(valid.map((f) => f.id), ["diwali"]);
  assert.equal(problems.length, 4); // three broken + one duplicate
});

test("the date is taken in India time", () => {
  const ist = (iso) => dateIn("Asia/Kolkata", new Date(iso));
  assert.equal(ist("2026-11-05T18:29:00Z"), "2026-11-05"); // 23:59 IST
  assert.equal(ist("2026-11-05T18:31:00Z"), "2026-11-06"); // 00:01 IST - Diwali starts
  assert.equal(ist("2026-11-11T18:29:00Z"), "2026-11-11"); // 23:59 IST - last day
  assert.equal(ist("2026-11-11T18:31:00Z"), "2026-11-12"); // over
});

test("theme: no festival returns the original config object untouched", () => {
  const base = { color: "#99a395", rimColor: "#586a6b" };
  assert.equal(mergeTheme(base, LIST, null, "transition"), base);
  assert.deepEqual(base, { color: "#99a395", rimColor: "#586a6b" });
});

test("theme: an active festival overrides only its own keys", () => {
  const base = { color: "#99a395", rimColor: "#586a6b" };
  assert.deepEqual(mergeTheme(base, LIST, "diwali", "transition"), { color: "#072f33", rimColor: "#586a6b" });
  assert.equal(mergeTheme(base, LIST, "diwali", "loader"), base); // no loader override
  assert.equal(mergeTheme(base, LIST, "holi", "transition"), base); // empty theme
  assert.equal(mergeTheme(base, LIST, "unknown", "transition"), base);
  assert.equal(mergeTheme(base, [{ ...DIWALI, theme: { transition: "oops" } }], "diwali", "transition"), base);
});

test("the real registry: valid, and Diwali only within its window", () => {
  const { problems } = validFestivals(FESTIVALS);
  assert.deepEqual(problems, []);
  const diwali = FESTIVALS.find((f) => f.id === "diwali");
  assert.ok(diwali, "diwali is registered");
  assert.equal(selectFestival({ festivals: FESTIVALS, date: diwali.start }), "diwali");
  assert.equal(selectFestival({ festivals: FESTIVALS, date: diwali.end }), "diwali");
  assert.equal(selectFestival({ festivals: FESTIVALS, date: "2026-10-28" }), null);
});
