import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from 'cn';
import { drawWorld } from './drawWorld';
import { useCanvasLoop, useReducedMotion } from './useCanvasLoop';
import { createWorld, resizeWorld, settle, stepWorld, type SimState, type World } from './world';

export type { SimState } from './world';

/**
 * Decorative cell field that follows a screen job: idle (Brownian drift), scoring
 * (molecules flow to cells and bind, intensity follows progress 0..1), done (calm,
 * several cells keep a green halo). Reduced motion renders one static frame.
 */
export function CellSimulation(props: { state: 'idle' | 'scoring' | 'done'; progress?: number; height?: number; className?: string }) {
  const { state, progress = 0, height = 260, className } = props;
  const reduce = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const live = useRef({ state: state as SimState, progress });
  useLayoutEffect(() => { live.current = { state, progress }; });

  const requestDraw = useCanvasLoop(
    canvasRef,
    ({ ctx, width, height: h, dt }) => {
      let w = worldRef.current;
      if (!w) {
        w = createWorld(width, h);
        if (reduce) settle(w, live.current.state, live.current.progress);
        worldRef.current = w;
      } else if (w.w !== width || w.h !== h) {
        w = resizeWorld(w, width, h);
        if (reduce && w !== worldRef.current) settle(w, live.current.state, live.current.progress);
        worldRef.current = w;
      }
      if (!reduce && dt > 0) stepWorld(w, dt, live.current.state, live.current.progress);
      drawWorld(ctx, w, reduce ? 0 : 1);
    },
    !reduce,
  );

  // Static mode: rebuild the still frame when the job state changes.
  useEffect(() => {
    if (!reduce) return;
    const w = worldRef.current;
    if (w) { worldRef.current = settle(createWorld(w.w, w.h), state, progress); }
    requestDraw();
  }, [reduce, state, progress, requestDraw]);

  return (
    <div
      className={cn('relative overflow-hidden rounded-xl', className)}
      style={{ height, background: 'var(--sim-bg)' }}
      data-testid="cell-simulation"
      data-state={state}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}
