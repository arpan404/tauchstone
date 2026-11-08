// Pure geometry for the ball-and-stick viewer: centring, rotation, projection,
// bond offsets and draw order. No DOM access, so it is unit-tested directly.
import type { components } from '@/api/schema';

export type Molecule3D = components['schemas']['Molecule3D'];
export type Vec3 = readonly [number, number, number];
/** Row-major 3x3 rotation matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface ElementStyle {
  color: string;
  /** Ball radius in angstrom (scaled covalent radius). */
  radius: number;
}

const HALOGEN: Record<string, string> = { F: '#7ccf6a', Cl: '#2fb36a', Br: '#2a8a5a', I: '#1f6b4f' };
const ELEMENTS: Record<string, ElementStyle> = {
  C: { color: '#3a3846', radius: 0.34 },
  N: { color: '#3d59ab', radius: 0.33 } /* nitrogen: conventional blue (CPK) */,
  O: { color: '#ef4b3f', radius: 0.32 },
  S: { color: '#f2b138', radius: 0.42 },
  P: { color: '#f29b38', radius: 0.42 },
  H: { color: '#d9d6df', radius: 0.2 },
  F: { color: HALOGEN.F, radius: 0.3 },
  Cl: { color: HALOGEN.Cl, radius: 0.4 },
  Br: { color: HALOGEN.Br, radius: 0.44 },
  I: { color: HALOGEN.I, radius: 0.5 },
};
const OTHER: ElementStyle = { color: '#9a97a3', radius: 0.4 };

export function elementStyle(el: string): ElementStyle {
  return ELEMENTS[el] ?? OTHER;
}

export interface Bond {
  i: number;
  j: number;
  /** 1 single, 2 double, 3 triple, 4 aromatic. */
  order: 1 | 2 | 3 | 4;
  /** Unit vector perpendicular to the bond, in the molecule frame, used to offset extra lines. */
  offset: Vec3;
}

export interface PreparedMolecule {
  elements: string[];
  /** Coordinates centred on the centroid, in angstrom. */
  coords: Vec3[];
  bonds: Bond[];
  /** Max distance of any atom centre from the centroid, plus the ball radius. */
  radius: number;
  formula: string;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/** Unit vector perpendicular to `axis`, pointing toward `toward` when possible. */
export function perpendicularToward(axis: Vec3, toward: Vec3 | null): Vec3 {
  const a = norm(axis);
  if (toward) {
    const t = sub(toward, [a[0] * dot(toward, a), a[1] * dot(toward, a), a[2] * dot(toward, a)]);
    if (len(t) > 1e-6) return norm(t);
  }
  const helper: Vec3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  return norm(cross(a, helper));
}

/**
 * Validates and centres a molecule. Returns null when the payload has no atoms or
 * references atoms that do not exist; the viewer then shows its empty state rather
 * than drawing a guessed shape.
 */
export function prepareMolecule(m: Molecule3D | null | undefined): PreparedMolecule | null {
  if (!m || !Array.isArray(m.atoms) || m.atoms.length === 0) return null;
  const n = m.atoms.length;
  for (const a of m.atoms) {
    if (![a.x, a.y, a.z].every(Number.isFinite)) return null;
  }
  let cx = 0, cy = 0, cz = 0;
  for (const a of m.atoms) { cx += a.x; cy += a.y; cz += a.z; }
  cx /= n; cy /= n; cz /= n;
  const coords: Vec3[] = m.atoms.map((a) => [a.x - cx, a.y - cy, a.z - cz]);
  const elements = m.atoms.map((a) => a.el);

  const raw: { i: number; j: number; order: 1 | 2 | 3 | 4 }[] = [];
  for (const b of m.bonds ?? []) {
    const [i, j, o = 1] = b;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n || i === j) return null;
    const order = (o === 2 || o === 3 || o === 4 ? o : 1) as 1 | 2 | 3 | 4;
    raw.push({ i, j, order });
  }
  const neighbours: number[][] = elements.map(() => []);
  for (const b of raw) { neighbours[b.i].push(b.j); neighbours[b.j].push(b.i); }

  const bonds: Bond[] = raw.map(({ i, j, order }) => {
    const axis = sub(coords[j], coords[i]);
    // Aromatic and ring double bonds sit toward the ring centre: average the other
    // neighbours (preferring aromatic ones) as the direction to lean the extra line.
    const others = [...neighbours[i].filter((k) => k !== j), ...neighbours[j].filter((k) => k !== i)];
    const arom = order === 4 ? others.filter((k) => raw.some((r) => r.order === 4 && ((r.i === k && (r.j === i || r.j === j)) || (r.j === k && (r.i === i || r.i === j))))) : [];
    const pick = arom.length ? arom : others;
    let toward: Vec3 | null = null;
    if (pick.length) {
      const mid: Vec3 = [(coords[i][0] + coords[j][0]) / 2, (coords[i][1] + coords[j][1]) / 2, (coords[i][2] + coords[j][2]) / 2];
      let s: Vec3 = [0, 0, 0];
      for (const k of pick) { const d = sub(coords[k], mid); s = [s[0] + d[0], s[1] + d[1], s[2] + d[2]]; }
      toward = s;
    }
    return { i, j, order, offset: perpendicularToward(axis, toward) };
  });

  let radius = 0;
  coords.forEach((c, k) => { radius = Math.max(radius, len(c) + elementStyle(elements[k]).radius); });
  return { elements, coords, bonds, radius: Math.max(radius, 0.8), formula: m.formula ?? '' };
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return r as unknown as Mat3;
}

export function rotX(t: number): Mat3 {
  const c = Math.cos(t), s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotY(t: number): Mat3 {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Re-orthonormalise after many incremental rotations so the matrix stays rigid. */
export function orthonormalize(m: Mat3): Mat3 {
  const x = norm([m[0], m[3], m[6]]);
  const y0: Vec3 = [m[1], m[4], m[7]];
  const y = norm(sub(y0, [x[0] * dot(x, y0), x[1] * dot(x, y0), x[2] * dot(x, y0)]));
  const z = cross(x, y);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

/** Rotation for a pointer drag of (dx, dy) pixels, applied in view space. */
export function dragRotation(rot: Mat3, dx: number, dy: number, speed = 0.01): Mat3 {
  return orthonormalize(mulMat(mulMat(rotX(dy * speed), rotY(dx * speed)), rot));
}

export interface Viewport {
  width: number;
  height: number;
  /** Pixels per angstrom at depth zero. */
  scale: number;
  /** Camera distance in angstrom; smaller means stronger perspective. */
  camera: number;
}

/**
 * Pixels per angstrom for a molecule spinning about the vertical view axis: the
 * vertical extent stays fixed and the horizontal extent is bounded by sqrt(x^2+z^2).
 */
export function spinFitScale(view: readonly Vec3[], ballRadius: number, width: number, height: number, zoom = 1): number {
  let rxz = 0, ry = 0;
  for (const [x, y, z] of view) { rxz = Math.max(rxz, Math.hypot(x, z)); ry = Math.max(ry, Math.abs(y)); }
  rxz += ballRadius; ry += ballRadius;
  return Math.min((width * 0.45) / Math.max(rxz, 0.1), (height * 0.4) / Math.max(ry, 0.1)) * zoom;
}

/** Pixels per angstrom that fits the molecule in the viewport at zoom 1. */
export function fitScale(radius: number, width: number, height: number, zoom = 1): number {
  return ((Math.min(width, height) * 0.44) / Math.max(radius, 0.1)) * zoom;
}

export interface Projected {
  x: number;
  y: number;
  /** View-space z; positive points toward the viewer (right-handed: x right, y up). */
  z: number;
  /** Perspective factor applied to sizes. */
  f: number;
}

/**
 * Projects a view-space point. The view is right-handed (x right, y up, z toward the
 * viewer) so chirality is preserved; screen y grows downward, hence the flip.
 */
export function project(v: Vec3, vp: Viewport): Projected {
  const f = vp.camera / Math.max(vp.camera - v[2], 0.1 * vp.camera);
  return { x: vp.width / 2 + v[0] * vp.scale * f, y: vp.height / 2 - v[1] * vp.scale * f, z: v[2], f };
}

/** Atom indices ordered back to front (painter's algorithm): most negative z first. */
export function depthOrder(z: readonly number[]): number[] {
  return z.map((_, k) => k).sort((a, b) => z[a] - z[b] || a - b);
}

export function det(m: Mat3): number {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

/** Eigenvectors of a symmetric 3x3 matrix (Jacobi), sorted by descending eigenvalue. */
export function symmetricEigen(a: Mat3): { values: number[]; vectors: Vec3[] } {
  const m = [...a];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 30; sweep++) {
    const off = m[1] * m[1] + m[2] * m[2] + m[5] * m[5];
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = m[p * 3 + q];
      if (Math.abs(apq) < 1e-12) continue;
      const theta = (m[q * 3 + q] - m[p * 3 + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { // m = m * J
        const mkp = m[k * 3 + p], mkq = m[k * 3 + q];
        m[k * 3 + p] = c * mkp - s * mkq;
        m[k * 3 + q] = s * mkp + c * mkq;
      }
      for (let k = 0; k < 3; k++) { // m = J^T * m
        const mpk = m[p * 3 + k], mqk = m[q * 3 + k];
        m[p * 3 + k] = c * mpk - s * mqk;
        m[q * 3 + k] = s * mpk + c * mqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p], vkq = v[k * 3 + q];
        v[k * 3 + p] = c * vkp - s * vkq;
        v[k * 3 + q] = s * vkp + c * vkq;
      }
    }
  }
  const idx = [0, 1, 2].sort((x, y) => m[y * 4] - m[x * 4]);
  return { values: idx.map((k) => m[k * 4]), vectors: idx.map((k) => [v[k], v[3 + k], v[6 + k]] as Vec3) };
}

/**
 * Proper rotation (det +1, never a reflection) that puts the molecule's longest axis
 * along screen x and its flattest axis toward the viewer.
 */
export function principalRotation(coords: readonly Vec3[]): Mat3 {
  if (coords.length < 3) return IDENTITY;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const [x, y, z] of coords) { xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  const { vectors } = symmetricEigen([xx, xy, xz, xy, yy, yz, xz, yz, zz]);
  const e1 = norm(vectors[0]);
  const e2 = norm(sub(vectors[1], [e1[0] * dot(e1, vectors[1]), e1[1] * dot(e1, vectors[1]), e1[2] * dot(e1, vectors[1])]));
  const e3 = cross(e1, e2);
  if (len(e1) < 0.5 || len(e2) < 0.5) return IDENTITY;
  return [e1[0], e1[1], e1[2], e2[0], e2[1], e2[2], e3[0], e3[1], e3[2]];
}

/** Mixes a #rrggbb colour toward white (t > 0) or black (t < 0). */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

export function clampZoom(z: number): number {
  return Math.min(4, Math.max(0.4, z));
}

/** Splits a formula into text runs with digit runs marked for subscript. */
export function formulaParts(formula: string): { text: string; sub: boolean }[] {
  const parts: { text: string; sub: boolean }[] = [];
  for (const m of formula.matchAll(/(\d+)|(\D+)/g)) parts.push({ text: m[0], sub: m[1] !== undefined });
  return parts;
}
