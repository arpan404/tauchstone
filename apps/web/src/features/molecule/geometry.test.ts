import { describe, expect, it } from 'vitest';
import piperacillin from './__fixtures__/piperacillin.BRD-K86873305.json';
import caffeine from './__fixtures__/caffeine.BRD-K02404261.json';
import {
  apply, clampZoom, depthOrder, det, dragRotation, elementStyle, fitScale, formulaParts, IDENTITY, mulMat,
  perpendicularToward, prepareMolecule, principalRotation, project, rotX, rotY, type Mat3, type Molecule3D, type Vec3,
} from './geometry';

const pip = piperacillin as Molecule3D;
const caf = caffeine as Molecule3D;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const signedVolume = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  return u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
};

describe('fixtures are real conformers', () => {
  it.each([['piperacillin', pip], ['caffeine', caf]] as const)('%s bonds have chemical lengths', (_, m) => {
    const p = prepareMolecule(m)!;
    expect(p).not.toBeNull();
    for (const b of p.bonds) {
      const d = dist(p.coords[b.i], p.coords[b.j]);
      expect(d).toBeGreaterThan(1.0);
      expect(d).toBeLessThan(1.95);
    }
  });
  it('piperacillin matches its formula', () => {
    const p = prepareMolecule(pip)!;
    const count = (el: string) => p.elements.filter((e) => e === el).length;
    expect(p.formula).toBe('C23H27N5O7S');
    expect([count('C'), count('N'), count('O'), count('S')]).toEqual([23, 5, 7, 1]);
    expect(p.bonds.filter((b) => b.order === 4)).toHaveLength(6);
  });
});

describe('prepareMolecule', () => {
  it('centres coordinates on the centroid', () => {
    const p = prepareMolecule(pip)!;
    const c = p.coords.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
    c.forEach((x) => expect(Math.abs(x / p.coords.length)).toBeLessThan(1e-9));
  });
  it('rejects empty or broken payloads instead of guessing', () => {
    expect(prepareMolecule(null)).toBeNull();
    expect(prepareMolecule({ formula: 'C', atoms: [], bonds: [] })).toBeNull();
    expect(prepareMolecule({ formula: 'C2', atoms: [{ el: 'C', x: 0, y: 0, z: 0 }], bonds: [[0, 5, 1]] })).toBeNull();
    expect(prepareMolecule({ formula: 'C', atoms: [{ el: 'C', x: Number.NaN, y: 0, z: 0 }], bonds: [] })).toBeNull();
  });
  it('bond offsets are unit and perpendicular to the bond', () => {
    const p = prepareMolecule(caf)!;
    for (const b of p.bonds) {
      const ax = [0, 1, 2].map((k) => p.coords[b.j][k] - p.coords[b.i][k]);
      const l = Math.hypot(...ax);
      expect(Math.hypot(...b.offset)).toBeCloseTo(1, 6);
      expect(Math.abs(ax.reduce((s, v, k) => s + v * b.offset[k], 0)) / l).toBeLessThan(1e-6);
    }
  });
  it('aromatic second lines lean toward the ring centre', () => {
    const p = prepareMolecule(pip)!;
    const ring = p.bonds.filter((b) => b.order === 4);
    const atoms = [...new Set(ring.flatMap((b) => [b.i, b.j]))];
    const centre = atoms.reduce((s, k) => [s[0] + p.coords[k][0] / atoms.length, s[1] + p.coords[k][1] / atoms.length, s[2] + p.coords[k][2] / atoms.length], [0, 0, 0]);
    for (const b of ring) {
      const mid = [0, 1, 2].map((k) => (p.coords[b.i][k] + p.coords[b.j][k]) / 2);
      const toC = [0, 1, 2].map((k) => centre[k] - mid[k]);
      expect(toC.reduce((s, v, k) => s + v * b.offset[k], 0)).toBeGreaterThan(0);
    }
  });
});

describe('rotation and projection', () => {
  it('principal rotation is a proper rotation (no mirror image)', () => {
    for (const m of [pip, caf]) {
      const r = principalRotation(prepareMolecule(m)!.coords);
      expect(det(r)).toBeCloseTo(1, 6);
    }
  });
  it('preserves chirality through rotation', () => {
    const p = prepareMolecule(pip)!;
    const [a, b, c, d] = [0, 3, 7, 12].map((k) => p.coords[k]);
    const r = mulMat(principalRotation(p.coords), dragRotation(IDENTITY, 40, -25));
    const before = signedVolume(a, b, c, d);
    const after = signedVolume(apply(r, a), apply(r, b), apply(r, c), apply(r, d));
    expect(Math.sign(after)).toBe(Math.sign(before));
    expect(after).toBeCloseTo(before, 6);
  });
  it('principal rotation puts the longest spread on screen x', () => {
    const p = prepareMolecule(pip)!;
    const r = principalRotation(p.coords);
    const v = p.coords.map((c) => apply(r, c));
    const spread = (k: number) => v.reduce((s, x) => s + x[k] * x[k], 0);
    expect(spread(0)).toBeGreaterThan(spread(1));
    expect(spread(1)).toBeGreaterThan(spread(2));
  });
  it('rotX/rotY compose and keep lengths', () => {
    const m: Mat3 = mulMat(rotX(0.7), rotY(-1.1));
    const v: Vec3 = [1.2, -0.4, 2];
    expect(Math.hypot(...apply(m, v))).toBeCloseTo(Math.hypot(...v), 9);
    expect(apply(mulMat(rotY(0.5), rotY(-0.5)), v).map((x) => +x.toFixed(9))).toEqual(v.map((x) => +x.toFixed(9)));
  });
  it('projects the origin to the centre with y up and nearer points larger', () => {
    const vp = { width: 200, height: 100, scale: 10, camera: 20 };
    expect(project([0, 0, 0], vp)).toMatchObject({ x: 100, y: 50, f: 1 });
    expect(project([0, 1, 0], vp).y).toBeLessThan(50);
    expect(project([0, 0, 2], vp).f).toBeGreaterThan(1);
    expect(project([0, 0, -2], vp).f).toBeLessThan(1);
  });
  it('orders atoms back to front', () => {
    expect(depthOrder([0.5, -2, 1.5, -2])).toEqual([1, 3, 0, 2]);
  });
  it('fits the molecule and clamps zoom', () => {
    expect(fitScale(5, 400, 200)).toBeCloseTo(17.6);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(0.01)).toBe(0.4);
  });
  it('drag rotation stays orthonormal after many steps', () => {
    let r: Mat3 = IDENTITY;
    for (let k = 0; k < 500; k++) r = dragRotation(r, 7, -3);
    expect(det(r)).toBeCloseTo(1, 9);
  });
  it('perpendicular falls back when no reference atom exists', () => {
    const o = perpendicularToward([0, 0, 1], null);
    expect(Math.abs(o[2])).toBeLessThan(1e-9);
    expect(Math.hypot(...o)).toBeCloseTo(1);
  });
});

describe('labels and styles', () => {
  it('splits formulas into subscript runs', () => {
    expect(formulaParts('C23H27N5O7S')).toEqual([
      { text: 'C', sub: false }, { text: '23', sub: true }, { text: 'H', sub: false }, { text: '27', sub: true },
      { text: 'N', sub: false }, { text: '5', sub: true }, { text: 'O', sub: false }, { text: '7', sub: true }, { text: 'S', sub: false },
    ]);
  });
  it('uses the agreed element colours', () => {
    expect(elementStyle('C').color).toBe('#3a3846');
    expect(elementStyle('N').color).toBe('#5b3df5');
    expect(elementStyle('O').color).toBe('#ef4b3f');
    expect(elementStyle('S').color).toBe('#f2b138');
    expect(elementStyle('P').color).toBe('#f29b38');
    expect(elementStyle('Xe').color).toBe('#9a97a3');
  });
});
