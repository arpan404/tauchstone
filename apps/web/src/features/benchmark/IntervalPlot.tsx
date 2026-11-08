import type { ReactNode } from 'react';
import { cn } from 'cn';

export type IntervalRow = {
  key: string;
  label: ReactNode;
  /** Accessible label for the row, e.g. "Random decision accuracy 88%". */
  ariaLabel: string;
  value: number;
  ci: [number, number];
  valueText: string;
  ciText: string;
  emphasis: 'accent' | 'ink' | 'muted';
};

const pos = (v: number, [lo, hi]: [number, number]) =>
  `${(Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1) * 100}%`;

/** Aligned dot plot with thin 95% CI intervals on a shared axis. No background tracks. */
export function IntervalPlot({
  rows,
  domain,
  ticks,
  tickFormat,
  valueHeader,
  labelWidth = '12.5rem',
  className,
}: {
  rows: IntervalRow[];
  domain: [number, number];
  ticks: number[];
  tickFormat: (v: number) => string;
  valueHeader: string;
  labelWidth?: string;
  className?: string;
}) {
  const cols = { gridTemplateColumns: `${labelWidth} minmax(0,1fr) 3.25rem 6.5rem` };
  const grid = (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1.5 right-1.5">
      {ticks.map((t) => (
        <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(t, domain) }} />
      ))}
    </div>
  );
  return (
    <div className={cn('text-[13px]', className)}>
      <div className="grid items-end gap-x-4 pb-1.5 text-[12px] text-ink-3" style={cols}>
        <span>Policy</span>
        <span />
        <span className="text-right">{valueHeader}</span>
        <span className="text-right">95% CI</span>
      </div>
      <ul className="m-0 list-none p-0">
        {rows.map((r) => {
          const tone =
            r.emphasis === 'accent' ? 'bg-primary' : r.emphasis === 'ink' ? 'bg-ink-2' : 'bg-ink-3/70';
          return (
            <li key={r.key} aria-label={r.ariaLabel} className="grid h-10 items-center gap-x-4" style={cols}>
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="relative h-full">
                {grid}
                <span className="absolute inset-y-0 left-1.5 right-1.5">
                  <span
                    className={cn('absolute top-1/2 h-px -translate-y-1/2', tone, r.emphasis === 'accent' && 'h-[2px]')}
                    style={{ left: pos(r.ci[0], domain), right: `calc(100% - ${pos(r.ci[1], domain)})` }}
                  />
                  {[r.ci[0], r.ci[1]].map((v, i) => (
                    <span
                      key={i}
                      className={cn('absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2', tone)}
                      style={{ left: pos(v, domain) }}
                    />
                  ))}
                  <span
                    className={cn(
                      'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface',
                      tone,
                      r.emphasis === 'accent' ? 'size-3' : 'size-2.5',
                    )}
                    style={{ left: pos(r.value, domain) }}
                  />
                </span>
              </span>
              <span
                className={cn(
                  'text-right font-mono tabular-nums',
                  r.emphasis === 'accent' ? 'font-semibold text-primary' : r.emphasis === 'ink' ? 'font-medium text-ink' : 'text-ink-2',
                )}
              >
                {r.valueText}
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums text-ink-3">{r.ciText}</span>
            </li>
          );
        })}
      </ul>
      <div aria-hidden className="grid gap-x-4 pt-1" style={cols}>
        <span />
        <span className="relative mx-1.5 h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 -translate-x-1/2 font-mono text-[10.5px] tabular-nums text-ink-3"
              style={{ left: pos(t, domain) }}
            >
              {tickFormat(t)}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
