import { useEffect, useRef } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import type { Schema } from '@/api/types';
import { cn } from 'cn';

type Row = NonNullable<Schema<'Signature'>['sign_check']>[number];

const HEAD = 'h-8 px-3 text-left text-[11.5px] font-medium text-ink-3';
/** Row colour lives on the cells so the rounded ends clip it (WebKit ignores radius on <tr>). */
const CELL =
  'px-3 py-2.5 transition-colors first:rounded-l-xl last:rounded-r-xl group-hover:bg-primary/6 group-aria-[current=true]:bg-primary/10';

/** Observed t statistic as a bar from zero: warm right = higher in Alzheimer's, blue left = lower. */
function StatBar({ stat, max }: { stat: number; max: number }) {
  const w = `${Math.min(50, (Math.abs(stat) / max) * 50)}%`;
  return (
    <span aria-hidden className="relative block h-1.5 w-24 rounded-full bg-ink/[0.06] max-sm:hidden">
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink/20" />
      <span
        className={cn('absolute inset-y-0 rounded-full', stat > 0 ? 'left-1/2 bg-[var(--warm)]' : 'right-1/2 bg-primary')}
        style={{ width: w }}
      />
    </span>
  );
}

export function SignCheckTable({
  rows,
  focusSymbol = null,
  onFocus,
}: {
  rows: Row[];
  focusSymbol?: string | null;
  onFocus?: (symbol: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.stat)));
  const focusRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    focusRow.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [focusSymbol]);
  return (
    <table aria-label="Sign check on known Alzheimer's genes" className="w-full border-separate border-spacing-y-0.5 text-[13px]">
      <thead>
        <tr>
          <th className={HEAD}>Gene</th>
          <th className={HEAD}>Expected</th>
          <th className={cn(HEAD, 'text-right')}>Observed t</th>
          <th className={cn(HEAD, 'max-sm:hidden')}>
            <span className="sr-only">Direction bar</span>
          </th>
          <th className={HEAD}>Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const selected = r.symbol.toLowerCase() === focusSymbol?.toLowerCase();
          return (
            <tr
              key={r.symbol}
              ref={selected ? focusRow : undefined}
              aria-current={selected || undefined}
              tabIndex={onFocus ? 0 : undefined}
              onClick={() => onFocus?.(r.symbol)}
              onKeyDown={(e) => {
                if (onFocus && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onFocus(r.symbol);
                }
              }}
              className={cn('group outline-none focus-visible:[&>td]:bg-primary/8', onFocus && 'cursor-pointer')}
            >
              <td className={cn(CELL, 'font-mono text-[14px] font-medium text-ink')}>{r.symbol}</td>
              <td className={cn(CELL, 'text-ink-2')}>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {r.expected === 'up' ? (
                    <ArrowUpIcon aria-hidden className="size-3.5 text-[var(--warm)]" />
                  ) : (
                    <ArrowDownIcon aria-hidden className="size-3.5 text-primary" />
                  )}
                  {r.expected === 'up' ? "up in Alzheimer's" : "down in Alzheimer's"}
                </span>
              </td>
              <td className={cn(CELL, 'text-right font-mono text-ink tabular-nums')}>
                {r.stat > 0 ? '+' : ''}
                {r.stat.toFixed(2)}
              </td>
              <td className={cn(CELL, 'max-sm:hidden')}>
                <StatBar stat={r.stat} max={max} />
              </td>
              <td className={CELL} aria-label={`${r.symbol} ${r.matches ? 'matches' : 'does not match'}`}>
                {r.matches ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ok">
                    <CheckCircleIcon weight="fill" aria-hidden className="size-4" /> Match
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-bad">
                    <XCircleIcon weight="fill" aria-hidden className="size-4" /> Mismatch
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
