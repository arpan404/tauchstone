import { useEffect, useRef } from 'react';
import type { Schema } from '@/api/types';
import {
  bondNormal,
  bondStyle,
  depthOrder,
  elementColor,
  projectPoint,
  rotatePoint,
  type Vec3,
} from './projection';

export type Molecule3D = Schema<'Molecule3D'>;

interface MoleculeViewerProps {
  molecule: Molecule3D | null;
  height?: number;
}

function centerAtoms(atoms: Array<{ x: number; y: number; z: number }>): Vec3[] {
  const n = atoms.length;
  const cx = atoms.reduce((s, a) => s + a.x, 0) / n;
  const cy = atoms.reduce((s, a) => s + a.y, 0) / n;
  const cz = atoms.reduce((s, a) => s + a.z, 0) / n;
  return atoms.map((a) => ({ x: a.x - cx, y: a.y - cy, z: a.z - cz }));
}

export function MoleculeViewer({ molecule, height = 280 }: MoleculeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const molRef = useRef(molecule);
  useEffect(() => {
    molRef.current = molecule;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let rotY = 0.6;
    let tiltX = 0.4;
    let zoom = 1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

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

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.01;
      tiltX = Math.min(1.4, Math.max(-1.4, tiltX + (e.clientY - lastY) * 0.01));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.min(3, Math.max(0.5, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const draw = () => {
      if (w === 0) return;
      const mol = molRef.current;
      ctx.clearRect(0, 0, w, h);
      if (!mol || mol.atoms.length === 0) return;
      const centered = centerAtoms(mol.atoms);
      const rotated = centered.map((p) => rotatePoint(p, rotY, tiltX));
      const radius = Math.min(w, h);
      const scale = radius * 0.32 * zoom;
      const P = rotated.map((p) => projectPoint(p, w / 2, h / 2, scale));

      const bondOrder = depthOrder(
        mol.bonds.map(([i, j]) => ({ z: (rotated[i]?.z ?? 0) + (rotated[j]?.z ?? 0) })),
      );
      for (const b of bondOrder) {
        const [i, j, orderRaw] = mol.bonds[b];
        const a = P[i];
        const c = P[j];
        if (!a || !c) continue;
        const style = bondStyle(orderRaw ?? 1);
        const [nx, ny] = bondNormal(a.sx, a.sy, c.sx, c.sy);
        const offsets =
          style.strokes === 1 ? [0] : style.strokes === 2 ? [-2.5, 2.5] : [-4, 0, 4];
        ctx.lineWidth = style.strokes === 3 ? 2 : 3;
        ctx.strokeStyle = 'rgba(60,56,70,0.35)';
        ctx.setLineDash(style.dashed ? [5, 4] : []);
        for (const off of offsets) {
          ctx.beginPath();
          ctx.moveTo(a.sx + nx * off, a.sy + ny * off);
          ctx.lineTo(c.sx + nx * off, c.sy + ny * off);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      for (const idx of depthOrder(rotated)) {
        const p = P[idx];
        const el = mol.atoms[idx]?.el ?? 'C';
        const col = elementColor(el);
        const r = (el.toUpperCase() === 'H' ? 4.5 : el.toUpperCase() === 'C' ? 7 : 8) * p.f;
        const g = ctx.createRadialGradient(
          p.sx - r * 0.35,
          p.sy - r * 0.35,
          r * 0.1,
          p.sx,
          p.sy,
          r,
        );
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, col);
        g.addColorStop(1, col);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(1.5, r), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      if (!dragging) rotY += 0.008;
      draw();
    };

    if (reduced) {
      draw();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  if (!molecule || molecule.atoms.length === 0) {
    return (
      <div
        data-testid="molecule-empty"
        aria-label="No molecule"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height,
          background: 'radial-gradient(ellipse at 50% 40%, #ffffff, #f1ecfb)',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: '2px dashed rgba(91,61,245,0.35)',
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="molecule-viewer"
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'radial-gradient(ellipse at 50% 40%, #ffffff, #f1ecfb)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Molecule: ${molecule.formula}`}
        data-testid="molecule-canvas"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <span
        data-testid="molecule-formula"
        style={{
          position: 'absolute',
          left: 12,
          top: 10,
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#6b7280',
        }}
      >
        {molecule.formula}
      </span>
    </div>
  );
}
