import { CheckIcon, LockSimpleIcon, XIcon } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from 'cn';

export type WellMarkerState = 'sealed' | 'next' | 'running' | 'survive' | 'fail';

const WELL: Record<WellMarkerState, string> = {
  sealed: 'border-line-strong bg-surface-2 text-ink-3',
  next: 'border-primary border-2 bg-surface text-primary',
  running: 'border-primary/30 border-2 bg-accent-soft text-primary',
  survive: 'border-transparent bg-ok text-white',
  fail: 'border-transparent bg-bad text-white',
};

/** Plate-well marker for one hidden test. The outcome glyph only exists after a server reveal. */
export function WellMarker({ state, size = 28 }: { state: WellMarkerState; size?: number }) {
  const reduce = useReducedMotion();
  const revealed = state === 'survive' || state === 'fail';
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} data-state={state} aria-hidden>
      <motion.span
        key={revealed ? state : 'hidden'}
        initial={reduce || !revealed ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        className={cn('grid size-full place-items-center rounded-full border transition-colors duration-300 motion-reduce:transition-none', WELL[state])}
      >
        {state === 'survive' && <CheckIcon weight="bold" className="size-3.5" />}
        {state === 'fail' && <XIcon weight="bold" className="size-3.5" />}
        {state === 'sealed' && <LockSimpleIcon className="size-3" />}
        {state === 'next' && <span className="size-2 rounded-full bg-primary" />}
      </motion.span>
      {state === 'running' && (
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
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
  points, slots,
}: { points: { p: number; outcome?: 'survive' | 'fail' }[]; slots: number }) {
  const reduce = useReducedMotion();
  const n = Math.max(1, slots);
  const x = (i: number) => (i / n) * 100;
  const y = (p: number) => (1 - Math.min(1, Math.max(0, p))) * 100;
  const line = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(pt.p)}`).join(' ');
  return (
    <div className="flex items-stretch gap-2" aria-hidden>
      <div className="flex flex-col justify-between py-0 font-mono text-[10px] leading-none text-ink-3">
        <span>1.0</span>
        <span>0.5</span>
        <span>0.0</span>
      </div>
      <div className="relative h-16 flex-1">
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          {[0, 50, 100].map((v) => (
            <line key={v} x1="0" x2="100" y1={v} y2={v} className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray={v === 50 ? '3 3' : undefined} />
          ))}
          {Array.from({ length: n + 1 }, (_, i) => (
            <line key={i} x1={x(i)} x2={x(i)} y1="96" y2="100" className="stroke-line-strong" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
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
              'absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface',
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
