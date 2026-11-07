import { useEffect, useRef } from 'react';
import { blobPathPoints, mulberry32 } from './geometry';

export type CellSimulationState = 'idle' | 'scoring' | 'done';

interface CellSimulationProps {
  state: CellSimulationState;
  progress?: number;
  height?: number;
}

interface Cell {
  x: number;
  y: number;
  r: number;
  phase: number;
  vx: number;
  vy: number;
  pink: boolean;
  flash: number;
  halo: number;
}

interface Molecule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  pink: boolean;
  target: number;
}

const N_CELLS = 9;
const N_MOLECULES = 42;
const SEED = 20261107;

function traceBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phase: number,
  tick: number,
  n = 14,
): void {
  const pts = blobPathPoints(cx, cy, r, phase, tick, n);
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function CellSimulation({ state, progress = 0, height = 280 }: CellSimulationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ state, progress });
  useEffect(() => {
    stateRef.current = { state, progress };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rng = mulberry32(SEED);
    const cells: Cell[] = Array.from({ length: N_CELLS }, () => ({
      x: 0.08 + rng() * 0.84,
      y: 0.1 + rng() * 0.8,
      r: 22 + rng() * 20,
      phase: rng() * 6,
      vx: (rng() - 0.5) * 0.0004,
      vy: (rng() - 0.5) * 0.0004,
      pink: rng() < 0.5,
      flash: 0,
      halo: 0,
    }));
    const molecules: Molecule[] = Array.from({ length: N_MOLECULES }, () => ({
      x: rng(),
      y: rng(),
      vx: 0,
      vy: 0,
      angle: rng() * 6,
      pink: rng() < 0.5,
      target: Math.floor(rng() * N_CELLS),
    }));

    let w = 0;
    let h = 0;
    let raf = 0;
    let tick = 0;
    let visible = true;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = rect.width;
      h = rect.height;
    };
    fit();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    io?.observe(canvas);

    const drawMoleculeGlyph = (m: Molecule) => {
      const mx = m.x * w;
      const my = m.y * h;
      const col = m.pink ? '#e85d9c' : '#5b3df5';
      const c = Math.cos(m.angle);
      const s = Math.sin(m.angle);
      const local: Array<[number, number]> = [
        [0, 0],
        [6, 0],
        [9, 5],
        [-4, 4],
      ];
      const pts = local.map(([a, b]) => [mx + a * c - b * s, my + a * s + b * c] as [number, number]);
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[3][0], pts[3][1]);
      ctx.stroke();
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || w === 0) return;
      const { state: st, progress: prog } = stateRef.current;
      const scoring = st === 'scoring';
      tick++;
      ctx.clearRect(0, 0, w, h);

      if (st === 'done') {
        cells.forEach((k, idx) => {
          if (idx < 4) k.halo = 0.45;
        });
      }
      for (const k of cells) {
        k.x += k.vx * (scoring ? 0.6 : 1);
        k.y += k.vy * (scoring ? 0.6 : 1);
        if (k.x < 0.08 || k.x > 0.92) k.vx *= -1;
        if (k.y < 0.1 || k.y > 0.9) k.vy *= -1;
        const cx = k.x * w;
        const cy = k.y * h;
        const membrane = k.pink ? '232,93,156' : '91,61,245';
        traceBlob(ctx, cx, cy, k.r, k.phase, tick);
        ctx.fillStyle = `rgba(${membrane},0.10)`;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = `rgba(${membrane},0.5)`;
        ctx.stroke();
        traceBlob(ctx, cx + k.r * 0.12, cy - k.r * 0.08, k.r * 0.36, k.phase + 2, tick, 10);
        ctx.fillStyle = `rgba(${membrane},0.25)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - k.r * 0.25, cy + k.r * 0.2, k.r * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${membrane},0.35)`;
        ctx.fill();

        if (st !== 'scoring' && st !== 'done') {
          k.halo = Math.max(0, k.halo - 0.01);
        }
        if (k.flash > 0) {
          const intensity = 0.35 + 0.65 * Math.min(1, Math.max(0, prog));
          ctx.strokeStyle = `rgba(18,163,106,${(k.flash * intensity).toFixed(3)})`;
          ctx.lineWidth = 3;
          traceBlob(ctx, cx, cy, k.r + 5, k.phase, tick);
          ctx.stroke();
          k.flash = Math.max(0, k.flash - 0.012);
        } else if (k.halo > 0) {
          ctx.strokeStyle = `rgba(18,163,106,${k.halo.toFixed(3)})`;
          ctx.lineWidth = 2.5;
          traceBlob(ctx, cx, cy, k.r + 4, k.phase, tick);
          ctx.stroke();
        }
      }

      for (const m of molecules) {
        const tg = cells[m.target];
        if (scoring) {
          const dx = tg.x * w - m.x * w;
          const dy = tg.y * h - m.y * h;
          const d = Math.hypot(dx, dy) || 1;
          if (d < tg.r + 4) {
            tg.flash = 1;
            m.x = rng();
            m.y = rng() < 0.5 ? 0 : 1;
            m.vx = 0;
            m.vy = 0;
            m.target = Math.floor(rng() * N_CELLS);
          } else {
            m.vx += (dx / d) * 0.00006;
            m.vy += (dy / d) * 0.00006;
          }
        }
        m.vx += (rng() - 0.5) * 0.00012;
        m.vy += (rng() - 0.5) * 0.00012;
        m.vx *= 0.96;
        m.vy *= 0.96;
        const speed = scoring ? 6 : 1;
        m.x = Math.min(1, Math.max(0, m.x + m.vx * speed));
        m.y = Math.min(1, Math.max(0, m.y + m.vy * speed));
        m.angle += 0.02;
        drawMoleculeGlyph(m);
      }
    };

    if (reduced) {
      fit();
      if (w !== 0) {
        const keep = stateRef.current;
        if (keep.state === 'done') cells.forEach((k) => (k.halo = 0.45));
        ctx.clearRect(0, 0, w, h);
        for (const k of cells) {
          const cx = k.x * w;
          const cy = k.y * h;
          const membrane = k.pink ? '232,93,156' : '91,61,245';
          traceBlob(ctx, cx, cy, k.r, k.phase, 0);
          ctx.fillStyle = `rgba(${membrane},0.10)`;
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = `rgba(${membrane},0.5)`;
          ctx.stroke();
          if (k.halo > 0) {
            ctx.strokeStyle = `rgba(18,163,106,${k.halo})`;
            ctx.lineWidth = 2.5;
            traceBlob(ctx, cx, cy, k.r + 4, k.phase, 0);
            ctx.stroke();
          }
        }
        for (const m of molecules) drawMoleculeGlyph(m);
      }
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Cell simulation: ${state}`}
      data-testid="cell-simulation"
      data-state={state}
      style={{ display: 'block', width: '100%', height }}
    />
  );
}
