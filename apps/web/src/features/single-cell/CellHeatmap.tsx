import { Fragment } from 'react';
import { cn } from 'cn';
import {
  cellColour,
  cellName,
  cellOf,
  cellShort,
  regionName,
  scoreText,
  signed,
  type ColumnGroup,
  type Drug,
} from './heatmap';

export interface Focus {
  drug: string | null;
  sig: string | null;
}

/** Diagonal hatching for cells that were not scored (never drawn as a zero). */
export const HATCH = 'bg-[repeating-linear-gradient(135deg,var(--line-strong)_0_2px,transparent_2px_6px)]';

/**
 * Drug x cell-type heatmap as a CSS grid. Row labels and column headers are buttons that focus
 * a drug or a cell type; cells focus both. Groups of columns share a dataset / region header.
 */
export function CellHeatmap({
  drugs,
  groups,
  limit,
  focus,
  onFocus,
}: {
  drugs: Drug[];
  groups: ColumnGroup[];
  limit: number;
  focus: Focus;
  onFocus: (f: Focus) => void;
}) {
  const template = [
    'minmax(9rem,15rem)',
    ...groups.map((g) =>
      g.scored === 0 ? '0.375rem minmax(4.5rem, 7.5rem)' : `0.375rem repeat(${g.signatures.length}, minmax(1.375rem, 1fr))`,
    ),
  ].join(' ');
  // Grid line where each group's first data column starts (1-based; label column is 1).
  const starts: number[] = [];
  let col = 2;
  for (const g of groups) {
    starts.push(col + 1);
    col += 1 + (g.scored === 0 ? 1 : g.signatures.length);
  }
  const bulkMax = Math.max(0.001, ...drugs.map((d) => Math.abs(d.bulk_consensus ?? 0)));
  const sigFocused = (id: string) => focus.sig === id;

  return (
    <div className="overflow-x-auto overscroll-x-contain pb-1">
      <div
        role="group"
        aria-label="Reversal score heatmap, drugs by cell type"
        className="grid min-w-[38rem] items-stretch gap-y-[3px]"
        style={{ gridTemplateColumns: template }}
      >
        {/* Group header: dataset and region */}
        <div className="flex items-end pb-1 pl-2 text-[11.5px] text-ink-3">Drug · bulk score</div>
        {groups.map((g) => (
          <Fragment key={g.key}>
            <span aria-hidden />
            <div
              className="min-w-0 pb-1.5 text-center"
              style={{ gridColumn: `span ${g.scored === 0 ? 1 : g.signatures.length}` }}
              title={`${g.dataset} · ${g.region ? regionName(g) : 'region unspecified'}`}
            >
              <div className="truncate font-mono text-[11.5px] text-ink-2">{g.dataset}</div>
              <div className={cn('truncate text-[12px] font-medium', g.scored ? 'text-ink' : 'text-ink-3')}>
                {g.region ? regionName(g) : 'region unspecified'}
              </div>
              <div aria-hidden className={cn('mx-1 mt-1 h-[3px] rounded-full', g.scored ? 'bg-primary/35' : 'bg-ink/10')} />
            </div>
          </Fragment>
        ))}

        {/* Column header: cell types */}
        <span aria-hidden />
        {groups.map((g) => (
          <Fragment key={g.key}>
            <span aria-hidden />
            {g.scored === 0 ? (
              <span className="flex h-7 items-center justify-center font-mono text-[11px] text-ink-3">
                {g.signatures.length} cell types
              </span>
            ) : g.signatures.map((s) => (
              <button
                key={s.signature_id}
                type="button"
                onClick={() => onFocus({ drug: null, sig: s.signature_id })}
                aria-pressed={sigFocused(s.signature_id)}
                aria-label={`${cellName(s)}, ${g.dataset} ${regionName(s)}`}
                title={`${cellName(s)} · ${g.dataset} · ${regionName(s)}`}
                className={cn(
                  'h-7 min-w-0 rounded-t-lg font-mono text-[11px] transition-colors outline-none hover:bg-primary/8 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60',
                  g.scored ? 'text-ink-2' : 'text-ink-3',
                  sigFocused(s.signature_id) && 'bg-primary/12 font-semibold text-primary hover:bg-primary/12',
                )}
              >
                {cellShort(s)}
              </button>
            ))}
          </Fragment>
        ))}

        {/* Fully unscored groups: one hatched block over every row, said once in words. */}
        {groups.map((g, gi) =>
          g.scored === 0 ? (
            <div
              key={`${g.key}-block`}
              className={cn('relative m-[1.5px] flex items-start justify-center rounded-[6px] ring-1 ring-ink/[0.06]', HATCH)}
              style={{ gridColumn: `${starts[gi]} / span 1`, gridRow: `3 / span ${drugs.length}` }}
            >
              <p className="sticky top-2 m-2 rounded-lg bg-[var(--glass-bg)] px-2 py-1.5 text-center text-[11.5px] leading-snug text-ink-2 backdrop-blur">
                Not scored
                <span className="block text-ink-3">fewer than 3 donors per group</span>
              </p>
            </div>
          ) : null,
        )}

        {/* Rows */}
        {drugs.map((d) => {
          const rowOn = focus.drug === d.candidate_id;
          const bulk = d.bulk_consensus;
          return (
            <Fragment key={d.candidate_id}>
              <button
                type="button"
                onClick={() => onFocus({ drug: d.candidate_id, sig: null })}
                aria-pressed={rowOn}
                aria-label={`${d.name}, rank ${d.pool_rank}`}
                className={cn(
                  'group/row flex h-7 min-w-0 items-center gap-2 rounded-l-lg pr-2 pl-2 text-left text-[13px] transition-colors outline-none hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-primary/60',
                  rowOn && 'bg-primary/12 hover:bg-primary/12',
                )}
              >
                <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">{d.pool_rank}</span>
                <span className={cn('min-w-0 flex-1 truncate', rowOn ? 'font-medium text-ink' : 'text-ink')}>{d.name}</span>
                {bulk != null && (
                  <span className="flex shrink-0 items-center gap-1.5" title={`Bulk score ${fmt3(bulk)}`}>
                    <span aria-hidden className="relative hidden h-1 w-6 rounded-full bg-ink/[0.07] min-[1400px]:block">
                      <span
                        className="absolute inset-y-0 right-0 rounded-full bg-primary"
                        style={{ width: `${Math.round((Math.abs(bulk) / bulkMax) * 100)}%` }}
                      />
                    </span>
                    <span className="font-mono text-[11.5px] text-ink-2 tabular-nums">{signed(bulk)}</span>
                  </span>
                )}
              </button>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <span aria-hidden className={cn(rowOn && 'bg-primary/12')} />
                  {g.scored > 0 && g.signatures.map((s, i) => {
                    const c = cellOf(d, s);
                    const colOn = sigFocused(s.signature_id);
                    const exact = rowOn && colOn;
                    const last = i === g.signatures.length - 1;
                    return (
                      <button
                        key={s.signature_id}
                        type="button"
                        tabIndex={-1}
                        onClick={() => onFocus({ drug: d.candidate_id, sig: s.signature_id })}
                        title={`${d.name} · ${cellName(s)} ${s.region ?? ''} · ${scoreText(d, s)}`}
                        aria-label={`${d.name}, ${cellName(s)} ${regionName(s)}: ${c.kind === 'score' ? `reversal ${c.value.toFixed(3)}` : c.reason}`}
                        className={cn(
                          'relative h-7 min-w-0 outline-none',
                          (rowOn || colOn) && 'bg-primary/12',
                          last && rowOn && 'rounded-r-lg',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'absolute inset-[1.5px] rounded-[5px] transition-transform',
                            c.kind === 'unscored' && cn(HATCH, 'opacity-70'),
                            exact && 'ring-2 ring-ink ring-offset-1 ring-offset-transparent',
                            !exact && 'hover:ring-2 hover:ring-primary/60',
                          )}
                          style={c.kind === 'score' ? { background: cellColour(c.value, limit) } : undefined}
                        />
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const fmt3 = (n: number) => n.toFixed(3);

/** Key for the cell-type abbreviations used in column headers. */
export function AbbreviationKey() {
  const items: [string, string][] = [
    ['Exc', 'excitatory neurons'],
    ['Inh', 'inhibitory neurons'],
    ['Ast', 'astrocytes'],
    ['Mic', 'microglia'],
    ['Oli', 'oligodendrocytes'],
    ['OPC', 'oligodendrocyte precursors'],
  ];
  return (
    <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="font-mono text-ink-2">{k}</dt>
          <dd className="m-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Colour key: blue opposite to Alzheimer's, warm same direction, hatched not scored. */
export function HeatmapLegend({ limit }: { limit: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-primary">Opposite to Alzheimer's</span>
        <span className="font-mono text-[11px] text-ink-3">{signed(-limit)}</span>
        <span
          aria-hidden
          className="h-2.5 w-40 rounded-full max-sm:w-24"
          style={{
            background: `linear-gradient(90deg, ${cellColour(-limit, limit)}, ${cellColour(-limit / 4, limit)}, color-mix(in srgb, var(--ink) 6%, transparent), ${cellColour(limit / 4, limit)}, ${cellColour(limit, limit)})`,
          }}
        />
        <span className="font-mono text-[11px] text-ink-3">{signed(limit)}</span>
        <span className="font-medium text-[var(--warm)]">Same direction</span>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn('size-4 rounded-[4px] ring-1 ring-ink/10', HATCH)} />
        {'Not scored, fewer than 3 donors per group'}
      </div>
    </div>
  );
}
