// Seeded blob origins for the page transition: scattered evenly but
// irregularly (one per cell of a jittered grid, cells chosen at random),
// each with its own size and start delay so the blobs grow in a staggered,
// uneven way rather than all at once.

// small fast seeded RNG (mulberry32)
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @returns {{ x: number, y: number, delay: number, size: number }[]}
 *   x, y in 0..1 across the screen (y down); delay 0..0.45 of the phase;
 *   size a radius multiplier
 */
export function makePoints(count, seed, aspect = 16 / 9) {
  const rand = seededRandom(seed);
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
  // shuffle, then keep `count` cells
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count).map(([c, r]) => ({
    x: (c + 0.15 + rand() * 0.7) / cols,
    y: (r + 0.15 + rand() * 0.7) / rows,
    delay: rand() * 0.45,
    size: 0.75 + rand() * 0.55,
  }));
}
