/** Pure 3D projection helpers for the canvas ball-and-stick molecule viewer. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const ELEMENT_COLORS: Record<string, string> = {
  C: '#3a3846',
  N: '#5b3df5',
  O: '#ef4b3f',
  S: '#f2b138',
  P: '#f29b38',
  F: '#2fae6e',
  CL: '#2fae6e',
  BR: '#2fae6e',
  I: '#2fae6e',
};

export function elementColor(el: string): string {
  return ELEMENT_COLORS[el.toUpperCase()] ?? '#9aa0a6';
}

/** Rotate around Y by rotY, then tilt around X by tiltX. */
export function rotatePoint(p: Vec3, rotY: number, tiltX: number): Vec3 {
  const ca = Math.cos(rotY);
  const sa = Math.sin(rotY);
  const x1 = p.x * ca - p.z * sa;
  const z1 = p.x * sa + p.z * ca;
  const cb = Math.cos(tiltX);
  const sb = Math.sin(tiltX);
  const y2 = p.y * cb - z1 * sb;
  const z2 = p.y * sb + z1 * cb;
  return { x: x1, y: y2, z: z2 };
}

export interface Projected extends Vec3 {
  /** Screen x/y. */
  sx: number;
  sy: number;
  /** Perspective scale factor (larger = nearer). */
  f: number;
}

/** Perspective-project a rotated point onto a 2D canvas. */
export function projectPoint(
  p: Vec3,
  cx: number,
  cy: number,
  scale: number,
  depth = 3,
): Projected {
  const f = depth / (depth + p.z);
  return { ...p, sx: cx + p.x * scale * f, sy: cy + p.y * scale * f, f };
}

/** Sort indices back-to-front by depth (paint far atoms first). */
export function depthOrder(points: Array<{ z: number }>): number[] {
  return points
    .map((_, i) => i)
    .sort((a, b) => points[a].z - points[b].z);
}

export interface BondStyle {
  /** Number of parallel strokes. */
  strokes: number;
  /** Aromatic bonds render dashed. */
  dashed: boolean;
}

/** Bond order per the Molecule3D contract: 1/2/3 single/double/triple, 4 aromatic. */
export function bondStyle(order: number): BondStyle {
  if (order === 4) return { strokes: 1, dashed: true };
  if (order === 2) return { strokes: 2, dashed: false };
  if (order === 3) return { strokes: 3, dashed: false };
  return { strokes: 1, dashed: false };
}

/** Perpendicular unit vector to a screen-space segment, for multi-stroke bonds. */
export function bondNormal(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}
