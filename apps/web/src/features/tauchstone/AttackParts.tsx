import { CheckIcon, LockSimpleIcon, XIcon } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from 'cn';

export type WellMarkerState = 'sealed' | 'next' | 'running' | 'survive' | 'fail';

const WELL: Record<WellMarkerState, string> = {
  sealed: 'bg-ink/[0.06] text-ink-3',
  next: 'bg-frost text-primary ring-2 ring-primary',
  running: 'bg-accent-soft text-primary',
  survive: 'bg-ok text-white',
  fail: 'bg-bad text-white',
};

/** Plate-well marker for one hidden test. The outcome glyph only exists after a server reveal. */
export function WellMarker({ state, size = 30 }: { state: WellMarkerState; size?: number }) {
  const reduce = useReducedMotion();
  const revealed = state === 'survive' || state === 'fail';
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} data-state={state} aria-hidden>
      <motion.span
        key={revealed ? state : 'hidden'}
        initial={reduce || !revealed ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className={cn('grid size-full place-items-center rounded-full transition-colors duration-300 motion-reduce:transition-none', WELL[state])}
      >
        {state === 'survive' && <CheckIcon weight="bold" className="size-3.5" />}
        {state === 'fail' && <XIcon weight="bold" className="size-3.5" />}
        {(state === 'sealed' || state === 'next') && <LockSimpleIcon weight={state === 'next' ? 'fill' : 'regular'} className="size-3.5" />}
      </motion.span>
      {state === 'running' && (
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-primary/15 border-t-primary"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
        />
      )}
    </span>
  );
}

/**
 * P(claim holds) across reveals. One slot per budgeted experiment, so the trace shows how much
 * of the session is spent. Dots after the first carry the reveal outcome.
 */
export function BeliefTrace({
  points, slots, className,
}: { points: { p: number; outcome?: 'survive' | 'fail' }[]; slots: number; className?: string }) {
  const reduce = useReducedMotion();
  const n = Math.max(1, slots);
  const x = (i: number) => (i / n) * 100;
  const y = (p: number) => (1 - Math.min(1, Math.max(0, p))) * 100;
  const line = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(pt.p)}`).join(' ');
  const area = points.length > 1 ? `${line} L${x(points.length - 1)} 100 L0 100 Z` : '';
  return (
    <div className={cn('flex items-stretch gap-2', className)} aria-hidden>
      <div className="flex flex-col justify-between font-mono text-[10px] leading-none text-ink-3">
        <span>1.0</span>
        <span>0.5</span>
        <span>0.0</span>
      </div>
      <div className="relative h-full min-h-16 flex-1">
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="belief-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 50, 100].map((v) => (
            <line key={v} x1="0" x2="100" y1={v} y2={v} stroke="var(--ink)" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={v === 50 ? '3 3' : undefined} />
          ))}
          {Array.from({ length: n + 1 }, (_, i) => (
            <line key={i} x1={x(i)} x2={x(i)} y1="95" y2="100" stroke="var(--ink)" strokeOpacity="0.18" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {area && (
            <motion.path d={area} fill="url(#belief-fill)" initial={false} animate={{ d: area }}
              transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }} />
          )}
          {points.length > 1 && (
            <motion.path
              d={line}
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{ d: line }}
              transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </svg>
        {points.map((pt, i) => (
          <motion.span
            key={i}
            className={cn(
              'absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-rim',
              pt.outcome === 'fail' ? 'bg-bad' : pt.outcome === 'survive' ? 'bg-ok' : 'bg-primary',
            )}
            style={{ left: `${x(i)}%`, top: `${y(pt.p)}%` }}
            initial={reduce || i === 0 ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          />
        ))}
      </div>
    </div>
  );
}
