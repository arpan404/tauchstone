import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  CirclesThreeIcon,
  FlaskIcon,
  GridFourIcon,
  InfoIcon,
  TableIcon,
} from '@phosphor-icons/react';
import { useMockStatus } from '@/api/hooks';
import { EmptyState, NumberTicker, Panel, StatusBadge } from '@/components/system';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProvenanceFooter } from '@/features/disease-signature/ProvenanceFooter';
import { cn } from 'cn';
import { useSingleCell } from './query';
import { AbbreviationKey, CellHeatmap, HATCH, HeatmapLegend, type Focus } from './CellHeatmap';
import { FocusReadout } from './FocusReadout';
import {
  cellName,
  cellShort,
  colourLimit,
  columnGroups,
  fmt,
  isScored,
  notScored,
  ordered,
  queryInfo,
  regionName,
  type ColumnGroup,
  type Data,
} from './heatmap';

const HEAD = 'h-8 px-3 text-left text-[11.5px] font-medium whitespace-nowrap text-ink-3';
/** Row colour lives on the cells so the rounded ends clip it (WebKit ignores radius on <tr>). */
const CELL =
  'px-3 py-2 whitespace-nowrap transition-colors first:rounded-l-xl last:rounded-r-xl group-hover:bg-primary/6 group-aria-[current=true]:bg-primary/10';
/** Solid blue selected pill (design system selected state). */
const SELECTED =
  'bg-gradient-to-b from-[#2b6fd3] to-[#1453ad] text-white ring-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)]';

function Metric({ label, children, sub }: { label: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="m-0 mt-1 font-mono text-[22px] leading-none tracking-[-0.03em] whitespace-nowrap text-ink tabular-nums">
        {children}
      </dd>
      {sub && <p className="m-0 mt-1 text-[11.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

/** Every signature as a chip, one row per dataset and region: the hero's at-a-glance map. */
function CoverageMap({ groups, focus, onFocus }: { groups: ColumnGroup[]; focus: Focus; onFocus: (f: Focus) => void }) {
  const cellTypes = groups.reduce((m, g) => Math.max(m, g.signatures.length), 0);
  return (
    <div className="min-w-0 self-center rounded-2xl bg-frost/45 p-4 ring-1 ring-rim/70 max-md:p-3">
      <div
        className="grid items-center gap-x-1.5 gap-y-1.5"
        style={{ gridTemplateColumns: `minmax(5.5rem, 9.5rem) repeat(${cellTypes}, minmax(1.5rem, 2.5rem))` }}
      >
        <span className="text-[11.5px] text-ink-3">Dataset · region</span>
        {groups[0]?.signatures.map((s) => (
          <span key={s.cell_type} className="text-center font-mono text-[11px] text-ink-3" title={cellName(s)}>
            {cellShort(s)}
          </span>
        ))}
        {groups.map((g) => (
          <CoverageRow key={g.key} group={g} focus={focus} onFocus={onFocus} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[4px] bg-primary/25 ring-1 ring-primary/30" /> scored
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3 rounded-[4px] ring-1 ring-ink/10', HATCH)} /> not scored, fewer than 3
          donors per group
        </span>
      </div>
    </div>
  );
}

function CoverageRow({ group, focus, onFocus }: { group: ColumnGroup; focus: Focus; onFocus: (f: Focus) => void }) {
  return (
    <>
      <span className="min-w-0 truncate text-[12px] text-ink-2" title={`${group.dataset} · ${group.region ? regionName(group) : 'region unspecified'}`}>
        <span className="font-mono text-ink">{group.dataset}</span>
        <span className="text-ink-3"> · {group.region ?? 'all'}</span>
      </span>
      {group.signatures.map((s) => {
        const on = focus.sig === s.signature_id && !focus.drug;
        return (
          <button
            key={s.signature_id}
            type="button"
            aria-pressed={on}
            aria-label={`${cellName(s)}, ${s.cohort} ${regionName(s)}, ${isScored(s) ? 'scored' : 'not scored'}`}
            title={`${cellName(s)} · ${regionName(s)} · ${isScored(s) ? 'scored' : notScored}`}
            onClick={() => onFocus({ drug: null, sig: s.signature_id })}
            className={cn(
              'h-7 rounded-lg font-mono text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
              isScored(s)
                ? 'bg-primary/20 text-primary ring-1 ring-primary/25 hover:bg-primary/30'
                : cn(HATCH, 'text-ink-3 ring-1 ring-ink/10 hover:ring-primary/40'),
              on && SELECTED,
            )}
          >
            {cellShort(s)}
          </button>
        );
      })}
    </>
  );
}

function SignatureTable({ data, rows, focus, onFocus }: { data: Data; rows: Data['signatures']; focus: Focus; onFocus: (f: Focus) => void }) {
  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table aria-label="Signatures used" className="w-full border-separate border-spacing-y-0.5 text-[13px]">
        <thead>
          <tr>
            {['Dataset', 'Region', 'Cell type', "Donors, Alzheimer's / control", 'Nuclei', 'Genes FDR < 0.05', 'LINCS query', 'Status'].map((h) => (
              <th key={h} className={HEAD}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const q = queryInfo(data, s.signature_id);
            const on = focus.sig === s.signature_id;
            return (
              <tr
                key={s.signature_id}
                aria-current={on || undefined}
                tabIndex={0}
                onClick={() => onFocus({ drug: null, sig: s.signature_id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onFocus({ drug: null, sig: s.signature_id });
                  }
                }}
                className="group cursor-pointer outline-none focus-visible:[&>td]:bg-primary/8"
              >
                <td className={cn(CELL, 'font-mono text-ink')}>{s.cohort}</td>
                <td className={cn(CELL, 'text-ink-2')}>{s.region ? `${s.region}, ${regionName(s)}` : 'unspecified'}</td>
                <td className={cn(CELL, 'text-ink')}>{cellName(s)}</td>
                <td className={cn(CELL, 'font-mono tabular-nums', isScored(s) ? 'text-ink' : 'text-bad')}>
                  {s.n_donors_ad} / {s.n_donors_control}
                </td>
                <td className={cn(CELL, 'font-mono text-ink-2 tabular-nums')}>{s.n_nuclei.toLocaleString('en-US')}</td>
                <td className={cn(CELL, 'font-mono text-ink-2 tabular-nums')}>{s.n_fdr05?.toLocaleString('en-US') ?? 'unspecified'}</td>
                <td className={cn(CELL, 'text-ink-2')}>
                  {!isScored(s) || !q ? <span className="text-ink-3">n/a</span> : q.fallback ? 'top-ranked genes' : 'FDR < 0.05 genes'}
                </td>
                <td className={cn(CELL, 'min-w-[11rem] whitespace-normal', isScored(s) ? 'text-ink-2' : 'text-ink-3')}>{isScored(s) ? 'scored' : notScored}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AllScores({ data }: { data: Data }) {
  const { drugs, signatures } = ordered(data);
  return (
    <details className="group/d mx-2 mb-2 rounded-xl">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-[13px] text-ink-2 outline-none select-none hover:bg-primary/6 focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-details-marker]:hidden">
        <CaretRightIcon aria-hidden className="size-3.5 text-ink-3 transition-transform group-open/d:rotate-90" />
        All scores as a table
        <span className="text-[11.5px] text-ink-3">reversal score per drug and signature; hover for WTCS, KS, cosine</span>
      </summary>
      <div className="mt-1 max-h-[28rem] overflow-auto">
        <table aria-label="All reversal scores" className="w-full border-separate border-spacing-0 text-[12px]">
          <thead className="sticky top-0 z-[1] bg-[var(--glass-bg)] backdrop-blur">
            <tr>
              <th className={cn(HEAD, 'sticky left-0 bg-[var(--glass-bg)]')}>Drug (rank)</th>
              <th className={HEAD}>Bulk</th>
              {signatures.map((s) => (
                <th key={s.signature_id} className={cn(HEAD, 'font-mono')} title={`${s.cohort} · ${regionName(s)} · ${cellName(s)}`}>
                  {s.region ?? s.cohort.slice(-4)} {cellShort(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drugs.map((d) => (
              <tr key={d.candidate_id} className="hover:[&>td]:bg-primary/6">
                <td className="sticky left-0 rounded-l-xl bg-[var(--glass-bg)] px-3 py-1.5 whitespace-nowrap text-ink">
                  {d.pool_rank}. {d.name}
                </td>
                <td className="px-3 py-1.5 font-mono text-ink-2 tabular-nums">{fmt(d.bulk_consensus)}</td>
                {signatures.map((s) => {
                  const sc = d.scores.find((x) => x.signature_id === s.signature_id);
                  const ok = isScored(s) && sc?.consensus != null;
                  return (
                    <td
                      key={s.signature_id}
                      title={ok ? `WTCS ${fmt(sc?.scores?.wtcs)}; KS ${fmt(sc?.scores?.ks)}; cosine ${fmt(sc?.scores?.cosine)}` : notScored}
                      className={cn('px-3 py-1.5 font-mono tabular-nums last:rounded-r-xl', ok ? 'text-ink-2' : 'text-ink-3')}
                    >
                      {ok ? fmt(sc?.consensus) : 'n/s'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 px-3 pt-2 pb-1 text-[11.5px] text-ink-3">n/s = {notScored}</p>
      </div>
    </details>
  );
}

export function SingleCellPanel() {
  const { data, isLoading, error, refetch } = useSingleCell();
  const mock = useMockStatus(data?.provenance);
  const synthetic = data?.provenance.parameters?.synthetic === true;
  const view = useMemo(() => {
    if (!data) return null;
    const { drugs, signatures } = ordered(data);
    const groups = columnGroups(signatures);
    const scored = signatures.filter(isScored);
    const fallback = scored.filter((s) => queryInfo(data, s.signature_id)?.fallback).length;
    return { drugs, signatures, groups, scored, fallback, limit: colourLimit(drugs, signatures), datasets: [...new Set(signatures.map((s) => s.cohort))] };
  }, [data]);
  const [picked, setFocus] = useState<Focus | null>(null);
  const focus: Focus = picked ?? { drug: view?.drugs[0]?.candidate_id ?? null, sig: null };
  const empty = view && (!view.drugs.length || !view.signatures.length);
  const notBuilt = error && /failed: 404\b/.test(error.message);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-[1360px] space-y-4">
          {isLoading && (
            <>
              <p role="status" className="sr-only">
                Loading cell-type signatures
              </p>
              <Skeleton className="h-[360px] w-full rounded-[18px]" />
            </>
          )}
          {error && (
            <EmptyState
              icon={<GridFourIcon />}
              className="min-h-64"
              title={<span role="alert">{notBuilt ? 'Panel not built yet' : 'Could not load cell-type signatures'}</span>}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <ArrowClockwiseIcon /> Retry
                </Button>
              }
            />
          )}
          {data && view && (
            <section aria-labelledby="single-cell-title" className="glass @container min-w-0 px-7 py-6 max-md:px-5 max-md:py-5">
              <div className="grid gap-x-10 gap-y-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
                <div className="flex min-w-0 flex-col">
                  <p className="m-0 flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
                    <CirclesThreeIcon aria-hidden className="size-4 text-primary" />
                    Cell types · single-nucleus RNA
                  </p>
                  <h2
                    id="single-cell-title"
                    className="m-0 mt-2 font-heading text-[44px] leading-[1.06] font-normal tracking-[-0.035em] text-ink max-md:text-[32px]"
                  >
                    Reversal by cell type
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone="accent" tip={data.label}>
                      <FlaskIcon aria-hidden /> Exploratory
                    </StatusBadge>
                    {(mock || synthetic) && <StatusBadge tone="gap">Synthetic data</StatusBadge>}
                  </div>
                  <dl className="m-0 mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-ink-2">
                    <dt className="sr-only">Datasets</dt>
                    {view.datasets.map((d) => (
                      <dd key={d} className="m-0 rounded-full bg-frost/60 px-2.5 py-1 ring-1 ring-ink/[0.07]">
                        {d}
                      </dd>
                    ))}
                  </dl>
                  <dl className="m-0 mt-7 flex flex-wrap items-end gap-x-9 gap-y-5 @4xl:mt-auto @4xl:pt-7">
                    <div className="min-w-0">
                      <dt className="text-[11.5px] text-ink-3">Cell-type signatures scored</dt>
                      <dd className="m-0 mt-1 flex items-baseline gap-2 font-mono whitespace-nowrap tabular-nums">
                        <span className="text-[56px] leading-[0.92] font-light tracking-[-0.045em] text-primary max-md:text-[42px]">
                          <NumberTicker value={view.scored.length} />
                        </span>
                        <span className="text-[13px] text-ink-3">/ {view.signatures.length}</span>
                      </dd>
                    </div>
                    <Metric label="Drugs scored" sub="top by rank">
                      {view.drugs.length}
                    </Metric>
                    <Metric label="Not scored" sub="fewer than 3 donors per group">
                      {view.signatures.length - view.scored.length}
                    </Metric>
                    {view.fallback > 0 && (
                      <Metric
                        label="Scored on top-ranked genes"
                        sub={
                          <StatusBadge
                            tone="gap"
                            size="sm"
                            tip="Too few genes differed clearly between Alzheimer's and control in these cell types, so the comparison used the top genes anyway. Read their scores as weak evidence."
                          >
                            weak evidence
                          </StatusBadge>
                        }
                      >
                        {view.fallback}
                        <span className="ml-1 text-[13px] text-ink-3">/ {view.scored.length}</span>
                      </Metric>
                    )}
                  </dl>
                </div>
                <CoverageMap groups={view.groups} focus={focus} onFocus={setFocus} />
              </div>
            </section>
          )}

          {empty && <EmptyState icon={<GridFourIcon />} className="min-h-48" title={<span role="status">No cell-type scores available.</span>} />}

          {data && view && !empty && (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem] min-[1400px]:grid-cols-[minmax(0,1fr)_19rem]">
                <Panel
                  icon={<GridFourIcon />}
                  title="Reversal score by cell type"
                  caption="click a drug, a cell type or a cell"
                  flush
                  bodyClassName="px-3 pb-4"
                >
                  <div className="px-2 pt-1 pb-3">
                    <HeatmapLegend limit={view.limit} />
                  </div>
                  <CellHeatmap drugs={view.drugs} groups={view.groups} limit={view.limit} focus={focus} onFocus={setFocus} />
                  <div className="px-2 pt-3">
                    <AbbreviationKey />
                  </div>
                </Panel>
                <Panel title="Focus" icon={<CirclesThreeIcon />} className="xl:self-start xl:sticky xl:top-0" aria-label="Focused drug or cell type">
                  <FocusReadout
                    data={data}
                    drugs={view.drugs}
                    signatures={view.signatures}
                    limit={view.limit}
                    focus={focus}
                    onFocus={setFocus}
                  />
                </Panel>
              </div>

              <Panel icon={<TableIcon />} title="Signatures used" caption="Alzheimer's vs control, one signature per dataset, region and cell type" flush>
                <SignatureTable data={data} rows={view.signatures} focus={focus} onFocus={setFocus} />
                <AllScores data={data} />
              </Panel>
            </>
          )}

          {data && (data.note || data.cell_typing) && (
            <Panel icon={<InfoIcon />} title="Method notes">
              <div className="flex max-w-[110ch] flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
                {data.note && <p className="m-0">{data.note}</p>}
                {data.cell_typing && <p className="m-0">{data.cell_typing}</p>}
              </div>
            </Panel>
          )}
          {data && <ProvenanceFooter provenance={data.provenance} />}
        </div>
      </div>
    </div>
  );
}
