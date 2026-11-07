// Seeded, DOM-free model of the cell field: cells drift, small molecules diffuse,
// and while scoring they flow to cells and bind. Rendering lives in drawWorld.ts.

export type SimState = 'idle' | 'scoring' | 'done';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Organelle { dx: number; dy: number; rx: number; ry: number; rot: number; kind: 'mito' | 'vesicle' }
export interface Cell {
  x: number; y: number; r: number; vx: number; vy: number;
  phase: number; pink: boolean;
  nucleus: { dx: number; dy: number; r: number };
  organelles: Organelle[];
  receptors: number[]; // membrane angles
  flash: number; // 0..1 binding flash
  bound: number; // binding events this run
  halo: number; // 0..1 current green halo
  affinity: number; // fixed per cell, breaks ties when choosing haloed cells
}
export interface Mol {
  x: number; y: number; vx: number; vy: number;
  angle: number; spin: number; tilt: number;
  shape: number; pink: boolean;
  target: number; // cell index
  affinity: number; // 0..1; lower joins the flow earlier as progress rises
  fade: number; // 0..1 fade-in after respawn
}
export interface Ripple { x: number; y: number; r: number; t: number }
export interface World {
  w: number; h: number; time: number;
  cells: Cell[]; mols: Mol[]; ripples: Ripple[];
  rng: () => number;
  energy: number; // smoothed activity level
  intensity: number; // smoothed scoring intensity 0..1
  binds: number;
  last: SimState;
}

export const SEED = 20261105;

export function countsFor(w: number, h: number): { cells: number; mols: number } {
  const area = Math.max(1, w * h);
  return {
    cells: Math.min(14, Math.max(5, Math.round(area / 17000))),
    mols: Math.min(72, Math.max(18, Math.round(area / 4200))),
  };
}

function makeMol(rng: () => number, w: number, h: number, nCells: number, edge: boolean): Mol {
  let x = rng() * w, y = rng() * h;
  if (edge) {
    const side = Math.floor(rng() * 4);
    if (side === 0) x = -6; else if (side === 1) x = w + 6; else if (side === 2) y = -6; else y = h + 6;
  }
  return {
    x, y, vx: 0, vy: 0,
    angle: rng() * Math.PI * 2, spin: (rng() - 0.5) * 1.6, tilt: rng() * Math.PI * 2,
    shape: Math.floor(rng() * 3), pink: rng() < 0.42,
    target: Math.floor(rng() * nCells), affinity: rng(), fade: edge ? 0 : 1,
  };
}

export function createWorld(w: number, h: number, seed = SEED): World {
  const rng = mulberry32(seed);
  const { cells: nc, mols: nm } = countsFor(w, h);
  const base = Math.min(44, Math.max(18, Math.min(w, h) * 0.105));
  const cells: Cell[] = [];
  for (let k = 0; k < nc; k++) {
    const r = base * (0.78 + rng() * 0.5);
    // Rejection-sample a spot that does not overlap earlier cells too much.
    let x = 0, y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = r + rng() * Math.max(1, w - 2 * r);
      y = r + rng() * Math.max(1, h - 2 * r);
      if (cells.every((c) => Math.hypot(c.x - x, c.y - y) > (c.r + r) * 1.1)) break;
    }
    const organelles: Organelle[] = [];
    const nO = 3 + Math.floor(rng() * 3);
    for (let o = 0; o < nO; o++) {
      const a = rng() * Math.PI * 2, d = r * (0.5 + rng() * 0.25);
      const mito = o < 2;
      organelles.push({
        dx: Math.cos(a) * d, dy: Math.sin(a) * d,
        rx: mito ? r * 0.16 : r * (0.05 + rng() * 0.03), ry: mito ? r * 0.065 : 0,
        rot: rng() * Math.PI, kind: mito ? 'mito' : 'vesicle',
      });
    }
    cells.push({
      x, y, r, vx: (rng() - 0.5) * 8, vy: (rng() - 0.5) * 8,
      phase: rng() * Math.PI * 2, pink: rng() < 0.45,
      nucleus: { dx: (rng() - 0.5) * r * 0.22, dy: (rng() - 0.5) * r * 0.22, r: r * (0.33 + rng() * 0.06) },
      organelles,
      receptors: Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2 + rng() * 0.5),
      flash: 0, bound: 0, halo: 0, affinity: rng(),
    });
  }
  const mols = Array.from({ length: nm }, () => makeMol(rng, w, h, nc, false));
  return { w, h, time: 0, cells, mols, ripples: [], rng, energy: 0.3, intensity: 0, binds: 0, last: 'idle' };
}

export function resizeWorld(world: World, w: number, h: number): World {
  if (w <= 0 || h <= 0) return world;
  const { cells } = countsFor(w, h);
  if (cells !== world.cells.length) return createWorld(w, h);
  const sx = w / world.w, sy = h / world.h;
  for (const c of world.cells) { c.x *= sx; c.y *= sy; }
  for (const m of world.mols) { m.x *= sx; m.y *= sy; }
  world.w = w; world.h = h;
  return world;
}

/** Cells that keep a green halo once scoring is done: the most-bound ~40%, at least 3. */
export function haloSet(cells: readonly Cell[]): Set<number> {
  const k = Math.min(cells.length, Math.max(3, Math.round(cells.length * 0.4)));
  const order = cells.map((_, i) => i).sort((a, b) => cells[b].bound - cells[a].bound || cells[a].affinity - cells[b].affinity);
  return new Set(order.slice(0, k));
}

const ENERGY: Record<SimState, number> = { idle: 0.32, scoring: 1, done: 0.14 };
const ease = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Advances the world by dt seconds. Returns the number of binding events this step. */
export function stepWorld(world: World, dt: number, state: SimState, progress = 0): number {
  const { w, h, cells, mols, rng } = world;
  const p = Math.min(1, Math.max(0, progress));
  if (state !== world.last) {
    if (state === 'scoring' && world.last !== 'scoring') { for (const c of cells) c.bound = 0; world.binds = 0; }
    world.last = state;
  }
  world.time += dt;
  world.energy = ease(world.energy, state === 'scoring' ? 0.55 + 0.45 * p : ENERGY[state], 2, dt);
  world.intensity = ease(world.intensity, state === 'scoring' ? 0.2 + 0.8 * p : 0, 3, dt);
  const e = world.energy;
  const halos = state === 'done' ? haloSet(cells) : null;

  // Cells: slow drift, soft walls, mutual repulsion.
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    c.vx += (rng() - 0.5) * 30 * dt * e;
    c.vy += (rng() - 0.5) * 30 * dt * e;
    for (let j = i + 1; j < cells.length; j++) {
      const d = cells[j], dx = d.x - c.x, dy = d.y - c.y, dist = Math.hypot(dx, dy) || 1, min = (c.r + d.r) * 1.08;
      if (dist < min) {
        const push = ((min - dist) / min) * 40 * dt;
        c.vx -= (dx / dist) * push; c.vy -= (dy / dist) * push;
        d.vx += (dx / dist) * push; d.vy += (dy / dist) * push;
      }
    }
    const m = c.r * 0.9;
    if (c.x < m) c.vx += (m - c.x) * 2 * dt; else if (c.x > w - m) c.vx -= (c.x - (w - m)) * 2 * dt;
    if (c.y < m) c.vy += (m - c.y) * 2 * dt; else if (c.y > h - m) c.vy -= (c.y - (h - m)) * 2 * dt;
    const damp = Math.exp(-0.9 * dt);
    c.vx *= damp; c.vy *= damp;
    const cap = 4 + 10 * e, sp = Math.hypot(c.vx, c.vy);
    if (sp > cap) { c.vx *= cap / sp; c.vy *= cap / sp; }
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.flash = Math.max(0, c.flash - dt * 1.5);
    const haloTarget = halos ? (halos.has(i) ? 1 : 0) : state === 'scoring' ? Math.min(0.55, c.bound / 14) * p : 0;
    c.halo = ease(c.halo, haloTarget, state === 'done' ? 1.4 : 2.2, dt);
  }

  // Molecules: Brownian motion; while scoring, the active fraction flows to its target cell.
  let binds = 0;
  const activeFrac = state === 'scoring' ? 0.3 + 0.7 * p : 0;
  const sigma = 70 * (0.35 + e);
  for (const m of mols) {
    m.vx += (rng() - 0.5) * sigma * 2 * Math.sqrt(dt) * 3;
    m.vy += (rng() - 0.5) * sigma * 2 * Math.sqrt(dt) * 3;
    const active = m.affinity < activeFrac;
    const tg = cells[m.target];
    if (active && tg) {
      const dx = tg.x - m.x, dy = tg.y - m.y, d = Math.hypot(dx, dy) || 1;
      const pull = 90 + 320 * p;
      m.vx += (dx / d) * pull * dt; m.vy += (dy / d) * pull * dt;
    }
    const damp = Math.exp(-(active ? 2.2 : 3.2) * dt);
    m.vx *= damp; m.vy *= damp;
    const cap = active ? 60 + 170 * p : 18 + 30 * e, sp = Math.hypot(m.vx, m.vy);
    if (sp > cap) { m.vx *= cap / sp; m.vy *= cap / sp; }
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.angle += m.spin * dt * (0.6 + e);
    m.fade = Math.min(1, m.fade + dt * 1.5);

    // Membrane contact: bind (scoring, active) or glance off.
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], dx = m.x - c.x, dy = m.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (d < c.r + 3) {
        if (active && i === m.target) {
          c.flash = Math.min(1, c.flash + 0.55 + 0.45 * p);
          c.bound += 1;
          binds += 1;
          world.ripples.push({ x: c.x + (dx / d) * c.r, y: c.y + (dy / d) * c.r, r: 3, t: 0 });
          Object.assign(m, makeMol(rng, w, h, cells.length, true), { affinity: m.affinity, pink: m.pink, shape: m.shape });
        } else {
          m.x = c.x + (dx / d) * (c.r + 3.5); m.y = c.y + (dy / d) * (c.r + 3.5);
          const vn = m.vx * (dx / d) + m.vy * (dy / d);
          if (vn < 0) { m.vx -= 1.6 * vn * (dx / d); m.vy -= 1.6 * vn * (dy / d); }
        }
        break;
      }
    }
    // Walls: wrap idle molecules, bounce flowing ones back in.
    if (m.x < -10) m.x = w + 8; else if (m.x > w + 10) m.x = -8;
    if (m.y < -10) m.y = h + 8; else if (m.y > h + 10) m.y = -8;
  }
  world.binds += binds;

  for (const r of world.ripples) r.t += dt / 0.9;
  if (world.ripples.length) world.ripples = world.ripples.filter((r) => r.t < 1).slice(-40);
  return binds;
}

/** Runs the model forward so a single static frame looks like the given state. */
export function settle(world: World, state: SimState, progress = 0, seconds = 4): World {
  const steps = Math.round(seconds * 30);
  if (state === 'done') for (let k = 0; k < steps; k++) stepWorld(world, 1 / 30, 'scoring', 1);
  for (let k = 0; k < steps; k++) stepWorld(world, 1 / 30, state, progress);
  if (state === 'done') {
    const set = haloSet(world.cells);
    world.cells.forEach((c, i) => { c.halo = set.has(i) ? 1 : 0; c.flash = 0; });
    world.ripples = [];
  }
  return world;
}

/** Points of a wobbling membrane outline. Deterministic in (phase, time). */
export function blobPoints(cx: number, cy: number, r: number, phase: number, time: number, n = 28, wobble = 1): number[] {
  const pts: number[] = new Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + wobble * (0.055 * Math.sin(a * 3 + phase + time * 0.9) + 0.03 * Math.sin(a * 5 - phase * 1.3 + time * 1.4) + 0.018 * Math.sin(a * 2 + phase * 0.7 - time * 0.5)));
    pts[i * 2] = cx + Math.cos(a) * rr;
    pts[i * 2 + 1] = cy + Math.sin(a) * rr;
  }
  return pts;
}
