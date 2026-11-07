/** Deterministic RNG + wobbly blob-geometry helpers for the cell simulation. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Radius of the membrane at one angle: base wobble from two sine harmonics. */
export function blobRadius(baseR: number, angle: number, phase: number, tick: number): number {
  return (
    baseR *
    (1 +
      0.07 * Math.sin(angle * 3 + phase + tick * 0.02) +
      0.04 * Math.sin(angle * 5 - phase + tick * 0.03))
  );
}

/** Closed polygon points for a wobbly blob cell. */
export function blobPathPoints(
  cx: number,
  cy: number,
  r: number,
  phase: number,
  tick: number,
  n = 14,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = blobRadius(r, a, phase, tick);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}
