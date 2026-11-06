/** Deterministic PRNG (mulberry32) + small helpers. Seed 20261105 per contract. */

export const MOCK_SEED = 20261105;

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

/** Deterministic 32-bit hash of a string (for per-candidate streams). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stream seeded by global seed + key. */
export function streamFor(key: string): () => number {
  return mulberry32((MOCK_SEED ^ hashString(key)) >>> 0);
}

/** Approximately standard-normal sample (Box-Muller, deterministic given rng). */
export function randn(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function roundTo(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
