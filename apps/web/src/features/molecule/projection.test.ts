import { describe, expect, it } from 'vitest';
import {
  bondNormal,
  bondStyle,
  depthOrder,
  elementColor,
  projectPoint,
  rotatePoint,
} from './projection';

describe('elementColor', () => {
  it('maps the contract palette', () => {
    expect(elementColor('C')).toBe('#3a3846');
    expect(elementColor('N')).toBe('#5b3df5');
    expect(elementColor('O')).toBe('#ef4b3f');
    expect(elementColor('S')).toBe('#f2b138');
    expect(elementColor('P')).toBe('#f29b38');
  });

  it('renders halogens green and unknown elements grey', () => {
    expect(elementColor('Cl')).toBe('#2fae6e');
    expect(elementColor('Xx')).toBe('#9aa0a6');
  });
});

describe('rotatePoint', () => {
  it('is identity at zero rotation', () => {
    expect(rotatePoint({ x: 1, y: 2, z: 3 }, 0, 0)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('rotates Y by 90 degrees mapping +x to +z', () => {
    const p = rotatePoint({ x: 1, y: 0, z: 0 }, Math.PI / 2, 0);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.z).toBeCloseTo(1, 10);
  });
});

describe('projectPoint', () => {
  it('centers the origin and scales nearer points up', () => {
    const near = projectPoint({ x: 0, y: 0, z: -1 }, 100, 100, 50);
    const far = projectPoint({ x: 0, y: 0, z: 1 }, 100, 100, 50);
    expect([near.sx, near.sy]).toEqual([100, 100]);
    expect(near.f).toBeGreaterThan(far.f);
  });
});

describe('depthOrder', () => {
  it('sorts back-to-front (ascending z)', () => {
    expect(depthOrder([{ z: 1 }, { z: -2 }, { z: 0.5 }])).toEqual([1, 2, 0]);
  });
});

describe('bondStyle', () => {
  it('maps orders 1/2/3/4 to single/double/triple/aromatic', () => {
    expect(bondStyle(1)).toEqual({ strokes: 1, dashed: false });
    expect(bondStyle(2)).toEqual({ strokes: 2, dashed: false });
    expect(bondStyle(3)).toEqual({ strokes: 3, dashed: false });
    expect(bondStyle(4)).toEqual({ strokes: 1, dashed: true });
  });
});

describe('bondNormal', () => {
  it('returns a unit perpendicular', () => {
    const [nx, ny] = bondNormal(0, 0, 10, 0);
    expect(Math.hypot(nx, ny)).toBeCloseTo(1, 10);
    expect(nx).toBeCloseTo(0, 10);
    expect(Math.abs(ny)).toBeCloseTo(1, 10);
  });
});
