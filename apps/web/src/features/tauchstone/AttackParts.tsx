import type { ReactNode } from 'react';
import { CheckCircleIcon, CircleNotchIcon, LockSimpleIcon, TargetIcon, XCircleIcon } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from 'cn';
import type { Schema } from '@/api/types';
import { fmt2 } from './format';
import { kindOf, pct, VERDICT_CUTOFFS } from './attackCopy';
import { typeIcon, unit, VERDICT_TEXT } from './attackMeta';

type Verdict = Schema<'Verdict'>;
type Revealed = Schema<'RevealedOutcome'>;

const BANDS: { verdict: Verdict; range: string }[] = [
  { verdict: 'SUPPORTED_SO_FAR', range: `${pct(VERDICT_CUTOFFS.supported)} or more` },
  { verdict: 'INSUFFICIENT_EVIDENCE', range: 'In between' },
  { verdict: 'FRAGILE_CONTEXT_DEPENDENT', range: `${pct(VERDICT_CUTOFFS.fragile)} or less` },
];

/**
 * Horizontal meter for the chance the claim holds, with the preregistered verdict cut-offs
 * marked and named. `p` null = no session yet (no marker).
 */
export function ChanceMeter({ p, verdict }: { p: number | null; verdict: Verdict | null }) {
  const reduce = useReducedMotion();
  const lo = VERDICT_CUTOFFS.fragile * 100;
  const hi = VERDICT_CUTOFFS.supported * 100;
  const at = p === null ? null : Math.min(100, Math.max(0, p * 100));
  return (
    <div>
      <div className="relative pt-5" aria-hidden>
        {[lo, hi].map((v) => (
          <span key={v} className="absolute top-0 -translate-x-1/2 font-mono text-[11px] text-ink-3 tabular-nums" style={{ left: `${v}%` }}>
            {v}%
          </span>
        ))}
        <div className="relative h-3 overflow-hidden rounded-full bg-ink/[0.06] ring-1 ring-ink/[0.05]">
          <span className="absolute inset-y-0 left-0 bg-bad/20" style={{ width: `${lo}%` }} />
          <span className="absolute inset-y-0 right-0 bg-ok/20" style={{ width: `${100 - hi}%` }} />
          {[lo, hi].map((v) => <span key={v} className="absolute inset-y-0 w-px bg-ink/30" style={{ left: `${v}%` }} />)}
        </div>
        {at !== null && (
          <motion.span
            className="absolute top-5 -mt-1 size-5 -translate-x-1/2 rounded-full bg-primary ring-[3px] ring-frost"
            initial={false}
            animate={{ left: `${at}%` }}
            transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-3 tabular-nums">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      <ul className="sr-only" aria-label="Verdict cut-offs">
        {BANDS.map((b) => (
          <li key={b.verdict} aria-current={verdict === b.verdict ? 'true' : undefined}>{VERDICT_TEXT[b.verdict]}: {b.range}</li>
        ))}
      </ul>
    </div>
  );
}

export type CardState = 'sealed' | 'suggested' | 'running' | 'passed' | 'failed';

const STATE_BADGE: Record<CardState, { text: string; icon: ReactNode; cls: string }> = {
  sealed: { text: 'Result sealed', icon: <LockSimpleIcon />, cls: 'bg-ink/[0.06] text-ink-2' },
  suggested: { text: 'Suggested next', icon: <TargetIcon weight="bold" />, cls: 'bg-primary/12 text-primary' },
  running: { text: 'Running', icon: <CircleNotchIcon className="animate-spin motion-reduce:animate-none" />, cls: 'bg-primary/12 text-primary' },
  passed: { text: 'Passed', icon: <CheckCircleIcon weight="bold" />, cls: 'bg-ok/12 text-ok' },
  failed: { text: 'Failed', icon: <XCircleIcon weight="bold" />, cls: 'bg-bad/12 text-bad' },
};

export function StateBadge({ state, text }: { state: CardState; text?: string }) {
  const b = STATE_BADGE[state];
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap [&>svg]:size-3.5', b.cls)}>
      {b.icon}
      {text ?? b.text}
    </span>
  );
}

/** Observed value, pass rule and the move in the chance; exists only after a server reveal. */
export function ResultDetail({ r }: { r: Revealed }) {
  const passed = r.outcome === 'survive';
  const what = r.type === 'brain_exposure' ? 'Observed value' : 'Reversal score';
  const moved = Math.round(r.belief_after * 100) !== Math.round(r.belief_before * 100);
  return (
    <div className={cn('rounded-lg px-3 py-2 text-[12.5px] leading-snug', passed ? 'bg-ok/[0.08]' : 'bg-bad/[0.08]')} title={r.rule ?? undefined}>
      <p className="m-0 text-ink-2">
        {what} <span className="font-mono text-ink tabular-nums">{fmt2(r.value)}</span>
        {r.threshold != null && <> (needed <span className="font-mono tabular-nums">{fmt2(r.threshold)}</span> or lower)</>}
        <span aria-hidden className="text-ink/25"> · </span>
        chance <span className="font-mono tabular-nums">{pct(r.belief_before)} → {pct(r.belief_after)}</span>
        {!moved && ' (no change)'}
      </p>
      {r.rule && <p className="sr-only">Exact rule: {r.rule}</p>}
    </div>
  );
}

/** Icon chip + plain title + what the test checks, for one hidden test or one kind of test. */
export function TestHeading({ type, label, badge, hideChecks = false }: { type: string; label?: string; badge?: ReactNode; hideChecks?: boolean }) {
  const kind = kindOf(type);
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-primary [&>svg]:size-[18px]">{typeIcon(type)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium text-ink">{kind.title}</span>
          {badge}
        </span>
        {kind.checks && !hideChecks && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{kind.checks}</span>}
        {label && <span className="mt-0.5 block font-mono text-[11px] break-words text-ink-3">{unit(label)}</span>}
      </span>
    </span>
  );
}
