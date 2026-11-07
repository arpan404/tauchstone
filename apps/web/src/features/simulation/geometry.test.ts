import { describe, expect, it } from 'vitest';
import { blobPathPoints, blobRadius, mulberry32 } from './geometry';

describe('mulberry32', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(Array.from({ length: 5 }, () => a())).toEqual(
      Array.from({ length: 5 }, () => b()),
    );
  });

  it('emits values in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('blobRadius', () => {
  it('is periodic in angle', () => {
    expect(blobRadius(30, 0, 1.3, 60)).toBeCloseTo(blobRadius(30, Math.PI * 2, 1.3, 60), 10);
  });

  it('stays near the base radius', () => {
    for (let i = 0; i < 32; i++) {
      const r = blobRadius(30, (i / 32) * Math.PI * 2, 1.3, 60);
      expect(r).toBeGreaterThan(24);
      expect(r).toBeLessThan(36);
    }
  });
});

describe('blobPathPoints', () => {
  it('returns a closed polygon of n+1 points', () => {
    const pts = blobPathPoints(100, 100, 30, 1.3, 60, 14);
    expect(pts).toHaveLength(15);
    expect(pts[0][0]).toBeCloseTo(pts[14][0], 10);
    expect(pts[0][1]).toBeCloseTo(pts[14][1], 10);
  });
});
