import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches;
  const [reduce, setReduce] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCE_QUERY);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

export interface FrameInfo {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Seconds since the previous frame, clamped to 50 ms so a paused tab does not jump. */
  dt: number;
  /** Seconds since the loop started. */
  time: number;
}

/**
 * Runs `draw` on a canvas sized to its box at device pixel ratio.
 * animate=true: requestAnimationFrame loop, paused while offscreen.
 * animate=false: draws once per resize or `requestDraw()` call (reduced motion / static).
 */
export function useCanvasLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: (f: FrameInfo) => void,
  animate: boolean,
): () => void {
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; });
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // jsdom or no 2D support
    const s = { width: 0, height: 0, raf: 0, last: 0, start: 0, visible: true, alive: true };

    const frame = (now: number, dt: number) => {
      if (!s.width || !s.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, s.width, s.height);
      drawRef.current({ ctx, width: s.width, height: s.height, dt, time: (now - s.start) / 1000 });
    };
    const tick = (now: number) => {
      if (!s.alive) return;
      const dt = s.last ? Math.min((now - s.last) / 1000, 0.05) : 1 / 60;
      s.last = now;
      frame(now, dt);
      s.raf = requestAnimationFrame(tick);
    };
    const startLoop = () => {
      if (!animate || !s.visible || s.raf) return;
      s.last = 0;
      s.raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      s.width = r.width;
      s.height = r.height;
      const bw = Math.max(1, Math.round(r.width * dpr)), bh = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      if (!animate || !s.raf) frame(performance.now(), 0);
    };
    s.start = performance.now();
    redrawRef.current = () => { if (!s.raf) frame(performance.now(), 0); };

    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          s.visible = entries.some((e) => e.isIntersecting);
          if (s.visible) startLoop(); else stopLoop();
        })
      : null;
    io?.observe(canvas);
    startLoop();
    return () => {
      s.alive = false;
      stopLoop();
      ro?.disconnect();
      io?.disconnect();
      redrawRef.current = () => {};
    };
  }, [canvasRef, animate]);

  return useCallback(() => redrawRef.current(), []);
}
