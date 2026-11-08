import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useCanvasLoop, useReducedMotion, type FrameInfo } from '../simulation/useCanvasLoop';
import {
  apply, clampZoom, depthOrder, dragRotation, elementStyle, fitScale, formulaParts, mulMat, orthonormalize,
  prepareMolecule, principalRotation, project, rotX, rotY, shade, spinFitScale,
  type Mat3, type Molecule3D, type PreparedMolecule, type Projected, type Vec3,
} from './geometry';

export type { Molecule3D } from './geometry';

const AUTO_SPIN = 0.32; // rad/s about the view's vertical axis
const RESUME_AFTER = 1.8; // s of no interaction before auto-rotate resumes
const STICK = 0.15; // stick half-width in angstrom
const GAP = 0.15; // spacing of multiple-bond lines in angstrom

interface Palette { base: string; dark: string; light: string; stick: string; stickHi: string }
const paletteCache = new Map<string, Palette>();
function palette(el: string): Palette {
  let p = paletteCache.get(el);
  if (!p) {
    const c = elementStyle(el).color;
    p = { base: c, dark: shade(c, -0.45), light: shade(c, 0.78), stick: shade(c, el === 'C' ? 0.18 : 0.05), stickHi: shade(c, 0.6) };
    paletteCache.set(el, p);
  }
  return p;
}

function drawEmpty({ ctx, width, height }: FrameInfo) {
  const r = Math.min(width, height) * 0.26;
  ctx.save();
  ctx.strokeStyle = 'rgba(21,88,184,0.12)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(21,88,184,0.06)';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function stroke(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, p: Palette, dashed: boolean) {
  if (dashed) ctx.setLineDash([w * 1.1, w * 1.3]);
  ctx.strokeStyle = p.stick;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (!dashed && w > 2.2) {
    // Thin highlight along the upper-left edge reads as a lit cylinder.
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l, ny = dx / l;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    const o = w * 0.22;
    ctx.strokeStyle = p.stickHi;
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * o, y1 + ny * o);
    ctx.lineTo(x2 + nx * o, y2 + ny * o);
    ctx.stroke();
    ctx.globalAlpha /= 0.55;
  }
  if (dashed) ctx.setLineDash([]);
}

function drawMolecule(ctx: CanvasRenderingContext2D, width: number, height: number, mol: PreparedMolecule, rot: Mat3, zoom: number, fitRot: Mat3) {
  // Fit once per orientation reset (not per frame) so the molecule does not breathe while spinning.
  const scale = Math.min(spinFitScale(mol.coords.map((c) => apply(fitRot, c)), 0.5, width, height), fitScale(mol.radius, width, height) * 1.9) * zoom;
  const vp = { width, height, scale, camera: Math.max(mol.radius * 5, 14) };
  const view: Vec3[] = mol.coords.map((c) => apply(rot, c));
  const P: Projected[] = view.map((v) => project(v, vp));
  const zs = view.map((v) => v[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs), zr = zmax - zmin || 1;
  const byAtom: number[][] = mol.elements.map(() => []);
  mol.bonds.forEach((b, k) => { byAtom[b.i].push(k); byAtom[b.j].push(k); });

  // Soft contact shadow under the molecule.
  const sh = ctx.createRadialGradient(width / 2, height / 2 + mol.radius * scale * 0.9, 0, width / 2, height / 2 + mol.radius * scale * 0.9, mol.radius * scale * 0.9);
  sh.addColorStop(0, 'rgba(60,40,140,0.10)');
  sh.addColorStop(1, 'rgba(60,40,140,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = 'round';
  for (const a of depthOrder(zs)) {
    const pa = P[a];
    const fog = 0.26 * (1 - (view[a][2] - zmin) / zr); // farther atoms fade toward the background
    const pal = palette(mol.elements[a]);
    ctx.globalAlpha = 1;
    // Half-bonds from this atom to each bond midpoint, coloured by this atom.
    for (const k of byAtom[a]) {
      const b = mol.bonds[k];
      const o = b.i === a ? b.j : b.i;
      const pb = P[o];
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      const f = (pa.f + pb.f) / 2;
      const w = STICK * 2 * scale * f;
      const dx = pb.x - pa.x, dy = pb.y - pa.y, l = Math.hypot(dx, dy) || 1;
      const perp: [number, number] = [-dy / l, dx / l];
      // Offset direction: the bond's in-plane perpendicular, foreshortened by the view.
      const ov = apply(rot, b.offset);
      let ox = ov[0], oy = -ov[1];
      const along = ox * (dx / l) + oy * (dy / l);
      ox -= along * (dx / l); oy -= along * (dy / l);
      const gap = GAP * scale * f;
      ctx.globalAlpha = 1 - fog * 0.6;
      if (b.order === 1) {
        stroke(ctx, pa.x, pa.y, mx, my, w, pal, false);
      } else if (b.order === 2) {
        const s = gap * 1.25;
        for (const sgn of [-1, 1]) stroke(ctx, pa.x + ox * s * sgn, pa.y + oy * s * sgn, mx + ox * s * sgn, my + oy * s * sgn, w * 0.58, pal, false);
      } else if (b.order === 3) {
        const s = gap * 1.7;
        stroke(ctx, pa.x, pa.y, mx, my, w * 0.5, pal, false);
        for (const sgn of [-1, 1]) stroke(ctx, pa.x + perp[0] * s * sgn, pa.y + perp[1] * s * sgn, mx + perp[0] * s * sgn, my + perp[1] * s * sgn, w * 0.42, pal, false);
      } else {
        stroke(ctx, pa.x, pa.y, mx, my, w * 0.78, pal, false);
        // Second, dashed line toward the ring centre, pulled in from the atom end.
        const s = gap * 2.3;
        const t0 = 0.42;
        stroke(ctx, pa.x + (mx - pa.x) * t0 + ox * s, pa.y + (my - pa.y) * t0 + oy * s, mx + ox * s, my + oy * s, w * 0.4, pal, true);
      }
    }
    // Shaded ball.
    const r = elementStyle(mol.elements[a]).radius * 1.12 * scale * pa.f;
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(pa.x - r * 0.38, pa.y - r * 0.42, r * 0.06, pa.x, pa.y, r * 1.02);
    g.addColorStop(0, pal.light);
    g.addColorStop(0.42, pal.base);
    g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pa.x, pa.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (fog > 0.01) {
      ctx.globalAlpha = fog;
      ctx.fillStyle = '#f4f0fc';
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Starting view: longest axis across, flattest axis toward the viewer, slight tilt. */
function homeRotation(mol: PreparedMolecule): Mat3 {
  return orthonormalize(mulMat(rotX(-0.38), mulMat(rotY(0.22), principalRotation(mol.coords))));
}

export function MoleculeViewer(props: { molecule: Molecule3D | null; height?: number }) {
  const { molecule, height = 280 } = props;
  const mol = useMemo(() => prepareMolecule(molecule), [molecule]);
  const reduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ rot: rotX(-0.35) as Mat3, fit: rotX(-0.35) as Mat3, zoom: 1, idle: RESUME_AFTER, pointers: new Map<number, { x: number; y: number }>(), pinch: 0 });

  useEffect(() => {
    view.current.rot = mol ? homeRotation(mol) : rotX(-0.35);
    view.current.fit = view.current.rot;
    view.current.zoom = 1;
  }, [mol]);

  const requestDraw = useCanvasLoop(
    canvasRef,
    (f) => {
      if (!mol) { drawEmpty(f); return; }
      const v = view.current;
      v.idle += f.dt;
      if (!reduce && v.pointers.size === 0 && v.idle > RESUME_AFTER) {
        const ramp = Math.min(1, (v.idle - RESUME_AFTER) / 0.8); // ease back in
        v.rot = orthonormalize(mulMat(rotY(AUTO_SPIN * ramp * f.dt), v.rot));
      }
      drawMolecule(f.ctx, f.width, f.height, mol, v.rot, v.zoom, v.fit);
    },
    !reduce && mol !== null,
  );
  useEffect(() => { requestDraw(); }, [mol, requestDraw]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !mol) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0015));
      v.idle = 0;
      requestDraw();
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [mol, requestDraw]);

  const pinchDistance = () => {
    const [a, b] = [...view.current.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!mol) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already released */ }
    view.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.current.pinch = pinchDistance();
    view.current.idle = 0;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const v = view.current;
    const prev = v.pointers.get(e.pointerId);
    if (!prev) return;
    v.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (v.pointers.size >= 2) {
      const d = pinchDistance();
      if (v.pinch > 0 && d > 0) v.zoom = clampZoom(v.zoom * (d / v.pinch));
      v.pinch = d;
    } else {
      v.rot = dragRotation(v.rot, e.clientX - prev.x, e.clientY - prev.y);
    }
    v.idle = 0;
    requestDraw();
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    view.current.pointers.delete(e.pointerId);
    view.current.pinch = pinchDistance();
    view.current.idle = 0;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!mol) return;
    const v = view.current;
    const step = 18;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => { v.rot = dragRotation(v.rot, -step, 0); },
      ArrowRight: () => { v.rot = dragRotation(v.rot, step, 0); },
      ArrowUp: () => { v.rot = dragRotation(v.rot, 0, -step); },
      ArrowDown: () => { v.rot = dragRotation(v.rot, 0, step); },
      '+': () => { v.zoom = clampZoom(v.zoom * 1.15); },
      '=': () => { v.zoom = clampZoom(v.zoom * 1.15); },
      '-': () => { v.zoom = clampZoom(v.zoom / 1.15); },
    };
    const fn = moves[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
    v.idle = 0;
    requestDraw();
  };

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border border-[#e6e2d8]"
      style={{ height, background: 'radial-gradient(ellipse at 50% 38%, #ffffff, #f1ecfb 78%)' }}
      data-testid="molecule-viewer"
      data-state={mol ? 'molecule' : 'empty'}
    >
      <canvas
        ref={canvasRef}
        className={mol ? 'block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary/40' : 'block h-full w-full'}
        role="img"
        aria-label={mol ? `3D structure ${mol.formula}` : 'No structure'}
        tabIndex={mol ? 0 : -1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          if (!mol) return;
          view.current.rot = homeRotation(mol);
          view.current.zoom = 1;
          requestDraw();
        }}
        onKeyDown={onKeyDown}
      />
      {mol && mol.formula && (
        <span
          className="pointer-events-none absolute bottom-2.5 left-3 rounded-md bg-white/75 px-2 py-0.5 font-mono text-[12px] text-[#3a3846] shadow-[0_0_0_1px_rgba(230,226,216,0.9)] backdrop-blur-sm"
          title={molecule?.method}
          data-testid="molecule-formula"
        >
          {formulaParts(mol.formula).map((p, k) => (p.sub ? <sub key={k} className="text-[9px]">{p.text}</sub> : <span key={k}>{p.text}</span>))}
        </span>
      )}
    </div>
  );
}
