import { describe, expect, it } from 'vitest';
import { blobPoints, countsFor, createWorld, haloSet, mulberry32, resizeWorld, settle, stepWorld } from './world';

const run = (state: 'idle' | 'scoring' | 'done', progress: number, seconds: number, w = createWorld(480, 260)) => {
  let binds = 0;
  for (let k = 0; k < seconds * 60; k++) binds += stepWorld(w, 1 / 60, state, progress);
  return { w, binds };
};

describe('cell world model', () => {
  it('is deterministic for a seed', () => {
    const a = run('scoring', 0.6, 2).w, b = run('scoring', 0.6, 2).w;
    expect(a.cells.map((c) => [c.x, c.y])).toEqual(b.cells.map((c) => [c.x, c.y]));
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });

  it('scales counts with area within bounds', () => {
    expect(countsFor(100, 100).cells).toBe(5);
    expect(countsFor(4000, 4000).cells).toBe(14);
    expect(countsFor(4000, 4000).mols).toBe(72);
  });

  it('never binds while idle and binds while scoring', () => {
    expect(run('idle', 0, 6).binds).toBe(0);
    expect(run('scoring', 0.8, 6).binds).toBeGreaterThan(5);
  });

  it('binds more as progress rises', () => {
    expect(run('scoring', 1, 6).binds).toBeGreaterThan(run('scoring', 0, 6).binds);
  });

  it('keeps cells inside the field', () => {
    const { w } = run('scoring', 1, 12);
    for (const c of w.cells) {
      expect(c.x).toBeGreaterThan(-c.r);
      expect(c.x).toBeLessThan(w.w + c.r);
      expect(c.y).toBeGreaterThan(-c.r);
      expect(c.y).toBeLessThan(w.h + c.r);
    }
  });

  it('done leaves a soft green halo on several cells and none on the rest', () => {
    const w = settle(createWorld(480, 260), 'done');
    const lit = w.cells.filter((c) => c.halo > 0.5).length;
    expect(lit).toBeGreaterThanOrEqual(3);
    expect(lit).toBeLessThan(w.cells.length);
    expect(haloSet(w.cells).size).toBe(lit);
  });

  it('halos fade when returning to idle', () => {
    const w = settle(createWorld(480, 260), 'done');
    run('idle', 0, 6, w);
    expect(Math.max(...w.cells.map((c) => c.halo))).toBeLessThan(0.05);
  });

  it('rescales positions on resize', () => {
    const w = createWorld(480, 260);
    const x0 = w.cells[0].x;
    const same = resizeWorld(w, 600, 208); // same area, same cell count
    expect(same).toBe(w);
    expect(w.cells[0].x).toBeCloseTo(x0 * 1.25);
    expect(resizeWorld(w, 1600, 900).cells.length).toBeGreaterThan(w.cells.length); // much larger: rebuilt
  });

  it('builds a closed blob outline near the requested radius', () => {
    const pts = blobPoints(50, 50, 20, 0.3, 1.2, 24);
    expect(pts).toHaveLength(48);
    for (let i = 0; i < 24; i++) {
      const r = Math.hypot(pts[i * 2] - 50, pts[i * 2 + 1] - 50);
      expect(r).toBeGreaterThan(17);
      expect(r).toBeLessThan(23);
    }
  });
});
