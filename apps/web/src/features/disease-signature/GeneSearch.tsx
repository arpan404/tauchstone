import { useEffect, useRef } from 'react';
import { ArrowDownIcon, ArrowUpIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import type { Schema } from '@/api/types';
import { cn } from 'cn';

type Gene = Schema<'GeneStat'>;

/** Genes matching a symbol or Entrez query: exact match first, then prefix, then substring. */
export function matchGenes(genes: Gene[], query: string): Gene[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (g: Gene) => {
    const s = g.symbol.toLowerCase();
    if (s === q || g.entrez_id === q) return 0;
    if (s.startsWith(q)) return 1;
    return 2;
  };
  return genes
    .filter((g) => g.symbol.toLowerCase().includes(q) || g.entrez_id.includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
}

/** The gene a query points at: an exact symbol or Entrez match, else the only match. */
export function focusGene(matches: Gene[], query: string): Gene | null {
  const q = query.trim().toLowerCase();
  const exact = matches.find((g) => g.symbol.toLowerCase() === q || g.entrez_id === q);
  return exact ?? (matches.length === 1 ? matches[0]! : null);
}

/** Search field with quick picks. Controlled: the page owns the query so the plot can follow it. */
export function GeneSearch({
  value,
  onChange,
  count,
  picks = [],
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  count: number;
  picks?: string[];
  className?: string;
}) {
  const active = value.trim().toLowerCase();
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor="signature-gene" className="text-[11.5px] text-ink-3">
        Inspect a gene
      </label>
      <div className="relative mt-1.5">
        <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
        <input
          id="signature-gene"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Symbol or Entrez ID"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-full bg-frost/70 pr-10 pl-10 font-mono text-[15px] text-ink ring-1 ring-ink/12 backdrop-blur outline-none placeholder:font-sans placeholder:text-[13.5px] placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear gene search"
            onClick={() => onChange('')}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-primary/8 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
        {active ? (
          <p role="status" className="m-0 text-[12px] text-ink-3">
            {count} matching gene{count === 1 ? '' : 's'}
            {count > 50 ? ', showing first 50' : ''}
          </p>
        ) : (
          picks.length > 0 && (
            <>
              <span className="text-[12px] text-ink-3">Try</span>
              {picks.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange(p)}
                  className="h-6 rounded-full bg-frost/60 px-2.5 font-mono text-[11.5px] text-ink-2 ring-1 ring-ink/[0.07] transition-colors hover:bg-primary/8 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
                >
                  {p}
                </button>
              ))}
            </>
          )
        )}
      </div>
    </div>
  );
}

const HEAD = 'h-8 px-3 text-left text-[11.5px] font-medium text-ink-3';
/** Row colour lives on the cells so the rounded ends clip it (WebKit ignores radius on <tr>). */
const CELL = 'px-3 py-2 transition-colors first:rounded-l-xl last:rounded-r-xl group-hover:bg-primary/6 group-aria-[current=true]:bg-primary/10';

/** Matching genes as quiet rounded rows; the focused gene is selected and scrolled into view. */
export function GeneMatchTable({
  matches,
  focusId,
  onFocus,
}: {
  matches: Gene[];
  focusId: string | null;
  onFocus: (g: Gene) => void;
}) {
  const focusRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    focusRow.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [focusId]);
  return (
    <div className="max-h-[22rem] overflow-auto px-2 pb-2">
      <table aria-label="Matching signature genes" className="w-full border-separate border-spacing-y-0.5 text-[13px]">
        <thead className="sticky top-0 z-[1] bg-[var(--glass-bg)] backdrop-blur">
          <tr>
            <th className={HEAD}>Gene</th>
            <th className={HEAD}>Entrez ID</th>
            <th className={cn(HEAD, 'text-right')}>log2FC</th>
            <th className={cn(HEAD, 'text-right')}>FDR</th>
            <th className={HEAD}>Sent to LINCS</th>
          </tr>
        </thead>
        <tbody>
          {matches.slice(0, 50).map((g) => {
            const selected = g.entrez_id === focusId;
            return (
              <tr
                key={g.entrez_id}
                ref={selected ? focusRow : undefined}
                aria-current={selected || undefined}
                tabIndex={0}
                onClick={() => onFocus(g)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus(g))}
                className="group cursor-pointer outline-none focus-visible:[&>td]:bg-primary/8"
              >
                <td className={cn(CELL, 'font-mono font-medium text-ink')}>{g.symbol}</td>
                <td className={cn(CELL, 'font-mono text-ink-2')}>{g.entrez_id}</td>
                <td className={cn(CELL, 'text-right font-mono tabular-nums', g.log2fc > 0 ? 'text-[var(--warm)]' : 'text-primary')}>
                  <span className="inline-flex items-center gap-1">
                    {g.log2fc > 0 ? <ArrowUpIcon aria-hidden className="size-3" /> : <ArrowDownIcon aria-hidden className="size-3" />}
                    {g.log2fc.toFixed(3)}
                  </span>
                </td>
                <td className={cn(CELL, 'text-right font-mono text-ink-2 tabular-nums')}>{g.fdr.toExponential(2)}</td>
                <td className={cn(CELL, 'text-ink-2')}>{g.query_set ? (g.query_set === 'up' ? 'up set' : 'down set') : <span className="text-ink-3">no</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
