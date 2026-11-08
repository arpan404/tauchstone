import { blobPoints, type Cell, type Mol, type World } from './world';

const VIOLET = [21, 88, 184] as const; // dodger-blue accent
const PINK = [120, 128, 146] as const; // neutral slate second tint
const GREEN = [18, 163, 106] as const;
const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** Smooth closed path through blob points (quadratic curves via midpoints). */
export function tracePath(ctx: CanvasRenderingContext2D, pts: readonly number[]) {
  const n = pts.length / 2;
  const mid = (i: number, k: 0 | 1) => (pts[((i % n) * 2) + k] + pts[(((i + 1) % n) * 2) + k]) / 2;
  ctx.beginPath();
  ctx.moveTo(mid(0, 0), mid(0, 1));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(pts[(i % n) * 2], pts[(i % n) * 2 + 1], mid(i, 0), mid(i, 1));
  ctx.closePath();
}

function drawCell(ctx: CanvasRenderingContext2D, c: Cell, t: number, motion: number) {
  const tint = c.pink ? PINK : VIOLET;
  const wob = 0.6 + 0.4 * motion;
  const time = t * motion;

  if (c.halo > 0.01) {
    const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.85, c.x, c.y, c.r * 1.75);
    const breathe = 0.85 + 0.15 * Math.sin(t * 1.3 + c.phase);
    g.addColorStop(0, rgba(GREEN, 0.26 * c.halo * breathe));
    g.addColorStop(1, rgba(GREEN, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 1.75, 0, Math.PI * 2);
    ctx.fill();
    tracePath(ctx, blobPoints(c.x, c.y, c.r + 6, c.phase, time, 28, wob));
    ctx.strokeStyle = rgba(GREEN, 0.45 * c.halo);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Cytoplasm with a lit upper-left and denser rim.
  const outline = blobPoints(c.x, c.y, c.r, c.phase, time, 28, wob);
  tracePath(ctx, outline);
  const fill = ctx.createRadialGradient(c.x - c.r * 0.35, c.y - c.r * 0.4, c.r * 0.1, c.x, c.y, c.r * 1.05);
  fill.addColorStop(0, 'rgba(255,255,255,0.75)');
  fill.addColorStop(0.55, rgba(tint, 0.08));
  fill.addColorStop(1, rgba(tint, 0.2));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = rgba(tint, 0.55);
  ctx.lineWidth = 1.7;
  ctx.stroke();
  // Inner leaflet of the bilayer.
  tracePath(ctx, blobPoints(c.x, c.y, c.r - 3, c.phase + 0.3, time, 24, wob));
  ctx.strokeStyle = rgba(tint, 0.16);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Receptors on the membrane.
  ctx.fillStyle = rgba(tint, 0.6);
  for (const a of c.receptors) {
    const k = Math.round(((a + time * 0.05) / (Math.PI * 2)) * 28) % 28;
    const i = (k + 28) % 28;
    ctx.beginPath();
    ctx.arc(outline[i * 2], outline[i * 2 + 1], 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Organelles drift slowly around the nucleus.
  const spin = time * 0.08 + c.phase;
  const cs = Math.cos(spin * 0.3), sn = Math.sin(spin * 0.3);
  for (const o of c.organelles) {
    const ox = c.x + o.dx * cs - o.dy * sn, oy = c.y + o.dx * sn + o.dy * cs;
    ctx.beginPath();
    if (o.kind === 'mito') {
      ctx.ellipse(ox, oy, o.rx, o.ry, o.rot + spin * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(tint, 0.14);
      ctx.fill();
      ctx.strokeStyle = rgba(tint, 0.38);
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.arc(ox, oy, o.rx, 0, Math.PI * 2);
      ctx.fillStyle = rgba(tint, 0.22);
      ctx.fill();
    }
  }

  // Nucleus and nucleolus.
  const nx = c.x + c.nucleus.dx, ny = c.y + c.nucleus.dy;
  tracePath(ctx, blobPoints(nx, ny, c.nucleus.r, c.phase + 2, time * 0.7, 18, wob * 0.8));
  const nf = ctx.createRadialGradient(nx - c.nucleus.r * 0.3, ny - c.nucleus.r * 0.3, 1, nx, ny, c.nucleus.r);
  nf.addColorStop(0, rgba(tint, 0.14));
  nf.addColorStop(1, rgba(tint, 0.3));
  ctx.fillStyle = nf;
  ctx.fill();
  ctx.strokeStyle = rgba(tint, 0.42);
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(nx + c.nucleus.r * 0.25, ny - c.nucleus.r * 0.15, c.nucleus.r * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = rgba(tint, 0.38);
  ctx.fill();

  if (c.flash > 0.01) {
    tracePath(ctx, blobPoints(c.x, c.y, c.r + 3 + (1 - c.flash) * 4, c.phase, time, 28, wob));
    ctx.strokeStyle = rgba(GREEN, 0.85 * c.flash);
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
}

// Decorative drug-like fragments (x, y, z in bond lengths; 0 = carbon, 1 = heteroatom).
const TEMPLATES: { atoms: [number, number, number, 0 | 1][]; bonds: [number, number][] }[] = [
  { atoms: [[0, 0, 0, 0], [1, 0, 0.1, 0], [1.5, 0.85, -0.1, 1], [-0.55, 0.8, 0.2, 0], [-0.5, -0.85, -0.2, 1]], bonds: [[0, 1], [1, 2], [0, 3], [0, 4]] },
  { atoms: [[0, 0, 0, 0], [0.95, 0.3, 0, 0], [1.2, 1.25, 0.1, 0], [0.4, 1.8, 0, 0], [-0.45, 1.05, -0.1, 1], [1.8, -0.35, 0.2, 1]], bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 5]] },
  { atoms: [[0, 0, 0, 1], [1, 0, 0.2, 0], [1.5, 0.85, 0, 0], [2.5, 0.85, -0.2, 1]], bonds: [[0, 1], [1, 2], [2, 3]] },
];

function drawMol(ctx: CanvasRenderingContext2D, m: Mol, scale: number) {
  const tpl = TEMPLATES[m.shape % TEMPLATES.length];
  const tint = m.pink ? PINK : VIOLET;
  const ca = Math.cos(m.angle), sa = Math.sin(m.angle), ct = Math.cos(m.tilt + m.angle * 0.6), st = Math.sin(m.tilt + m.angle * 0.6);
  const pts = tpl.atoms.map(([x, y, z, kind]) => {
    const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
    const y2 = y1 * ct - z * st, z2 = y1 * st + z * ct; // tumble about the screen x axis
    return { x: m.x + x1 * scale, y: m.y + y2 * scale, z: z2, kind };
  });
  ctx.globalAlpha = m.fade;
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > 45) {
    // Faint wake behind fast molecules so the flow toward cells reads at a glance.
    const k = Math.min(1, (sp - 45) / 120);
    ctx.strokeStyle = rgba(tint, 0.16 * k);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - m.vx * 0.16, m.y - m.vy * 0.16);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(tint, 0.55);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const [i, j] of tpl.bonds) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); }
  ctx.stroke();
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.kind ? 2.5 : 2.1) * (1 + p.z * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = p.kind ? (m.pink ? '#5d6475' : '#1558b8') : rgba(tint, 0.85);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Draws one frame. `motion` 0..1 damps membrane wobble (0 for a static frame). */
export function drawWorld(ctx: CanvasRenderingContext2D, world: World, motion = 1) {
  const t = world.time;
  for (const c of world.cells) drawCell(ctx, c, t, motion);
  for (const r of world.ripples) {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + r.t * 14, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(GREEN, 0.7 * (1 - r.t));
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  const scale = Math.min(7, Math.max(4.5, Math.min(world.w, world.h) * 0.022));
  for (const m of world.mols) drawMol(ctx, m, scale);
}
