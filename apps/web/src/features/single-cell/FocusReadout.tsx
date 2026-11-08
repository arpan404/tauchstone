import type { ReactNode } from 'react';
import { ArrowLeftIcon, CirclesThreeIcon, PillIcon, ProhibitIcon } from '@phosphor-icons/react';
import { StatusBadge } from '@/components/system';
import { cn } from 'cn';
import type { Focus } from './CellHeatmap';
import {
  cellColour,
  cellName,
  cellOf,
  cellShort,
  isScored,
  notScored,
  queryInfo,
  regionName,
  signed,
  type Data,
  type Drug,
  type Signature,
} from './heatmap';

const TILE = 'rounded-xl bg-frost/55 ring-1 ring-rim/80';

function Eyebrow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-3 [&>svg]:size-3.5 [&>svg]:text-primary">
      {icon}
      {children}
    </p>
  );
}

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="m-0 shrink-0 text-right font-mono text-[13px] whitespace-nowrap text-ink tabular-nums">{children}</dd>
    </div>
  );
}

/** Ranked bars: one score per line, blue left of zero, warm right. */
function ScoreBars({
  rows,
  limit,
  onPick,
}: {
  rows: { key: string; label: ReactNode; title?: string; value: number; focus: Focus }[];
  limit: number;
  onPick: (f: Focus) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onPick(r.focus)}
            title={r.title}
            className="grid w-full grid-cols-[minmax(0,1fr)_3.25rem_2.75rem] items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors outline-none hover:bg-primary/6 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="truncate text-[12.5px] text-ink-2">{r.label}</span>
            <span aria-hidden className="relative h-2 rounded-full bg-ink/[0.05]">
              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-ink/20" />
              <span
                className={cn('absolute inset-y-0 rounded-full', r.value < 0 ? 'right-1/2' : 'left-1/2')}
                style={{ width: `${Math.min(50, (Math.abs(r.value) / limit) * 50)}%`, background: cellColour(r.value, limit) }}
              />
            </span>
            <span className="text-right font-mono text-[12px] text-ink tabular-nums">{signed(r.value)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function QueryFact({ data, sig }: { data: Data; sig: Signature }) {
  const q = queryInfo(data, sig.signature_id);
  if (!q) return null;
  return (
    <Fact label="LINCS query">
      {q.fallback ? (
        <StatusBadge
          tone="gap"
          size="sm"
          tip="Too few genes passed FDR < 0.05, so the query used the top-ranked genes regardless of significance. Read this score as weak evidence."
        >
          top-ranked genes
        </StatusBadge>
      ) : (
        <span>
          {q.nUp} up · {q.nDown} down
        </span>
      )}
    </Fact>
  );
}

export function FocusReadout({
  data,
  drugs,
  signatures,
  limit,
  focus,
  onFocus,
}: {
  data: Data;
  drugs: Drug[];
  signatures: Signature[];
  limit: number;
  focus: Focus;
  onFocus: (f: Focus) => void;
}) {
  const drug = drugs.find((d) => d.candidate_id === focus.drug) ?? null;
  const sig = signatures.find((s) => s.signature_id === focus.sig) ?? null;
  const scored = signatures.filter(isScored);

  if (drug && sig) {
    const c = cellOf(drug, sig);
    return (
      <div aria-live="polite" className="flex flex-col gap-4">
        <div>
          <Eyebrow icon={<PillIcon />}>
            #{drug.pool_rank} · {sig.cohort}
          </Eyebrow>
          <h4 className="m-0 mt-1 truncate font-heading text-[22px] font-normal tracking-[-0.02em] text-ink">{drug.name}</h4>
          <p className="m-0 mt-0.5 text-[13px] text-ink-2">
            {cellName(sig)} · {regionName(sig)}
          </p>
        </div>
        {c.kind === 'score' ? (
          <>
            <div>
              <p className="m-0 text-[11.5px] text-ink-3">Reversal score</p>
              <p className={cn('m-0 font-mono text-[46px] leading-none font-light tracking-[-0.04em] tabular-nums', c.value < 0 ? 'text-primary' : 'text-[var(--warm)]')}>
                {signed(c.value, 3)}
              </p>
              <p className="m-0 mt-1.5 text-[12.5px] text-ink-2">
                {c.value < 0 ? "Opposite to Alzheimer's in this cell type" : "Same direction as Alzheimer's in this cell type"}
              </p>
            </div>
            <dl className={cn(TILE, 'm-0 grid grid-cols-3 gap-2 px-3 py-2.5')}>
              {(
                [
                  ['WTCS', c.wtcs],
                  ['KS', c.ks],
                  ['Cosine', c.cosine],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11.5px] text-ink-3">{k}</dt>
                  <dd className="m-0 font-mono text-[15px] text-ink tabular-nums">{v == null ? 'n/a' : signed(v, 3)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className={cn(TILE, 'm-0 flex items-center gap-2 px-3 py-3 text-[13px] text-ink-2')}>
            <ProhibitIcon aria-hidden className="size-4 shrink-0 text-ink-3" />
            {c.reason.replace(/^not scored: /, 'Not scored: ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <BackChip onClick={() => onFocus({ drug: drug.candidate_id, sig: null })}>All cell types for this drug</BackChip>
          <BackChip onClick={() => onFocus({ drug: null, sig: sig.signature_id })}>All drugs in this cell type</BackChip>
        </div>
      </div>
    );
  }

  if (sig) {
    const ok = isScored(sig);
    const ranked = ok
      ? drugs
          .map((d) => ({ d, c: cellOf(d, sig) }))
          .filter((x): x is { d: Drug; c: { kind: 'score'; value: number } } => x.c.kind === 'score')
          .sort((a, b) => a.c.value - b.c.value)
      : [];
    const reversing = ranked.filter((x) => x.c.value < 0).length;
    return (
      <div aria-live="polite" className="flex flex-col gap-3">
        <div>
          <Eyebrow icon={<CirclesThreeIcon />}>
            {sig.cohort} · {sig.region ?? 'region unspecified'}
          </Eyebrow>
          <h4 className="m-0 mt-1 font-heading text-[22px] font-normal tracking-[-0.02em] text-ink">{cellName(sig)}</h4>
          <p className="m-0 mt-0.5 text-[13px] text-ink-2">{regionName(sig)}</p>
        </div>
        <dl className={cn(TILE, 'm-0 px-3 py-1.5')}>
          <Fact label="Donors, Alzheimer's / control">
            {sig.n_donors_ad} / {sig.n_donors_control}
          </Fact>
          <Fact label="Nuclei">{sig.n_nuclei.toLocaleString('en-US')}</Fact>
          <Fact label="Genes FDR < 0.05">{sig.n_fdr05?.toLocaleString('en-US') ?? 'unspecified'}</Fact>
          {ok && <QueryFact data={data} sig={sig} />}
        </dl>
        {ok ? (
          <>
            <p className="m-0 text-[12.5px] text-ink-2">
              <span className="font-mono text-[15px] text-primary tabular-nums">{reversing}</span> of {ranked.length} drugs
              opposite to Alzheimer's here
            </p>
            <ScoreBars
              limit={limit}
              onPick={onFocus}
              rows={ranked.slice(0, 8).map(({ d, c }) => ({
                key: d.candidate_id,
                label: `${d.pool_rank}. ${d.name}`,
                value: c.value,
                focus: { drug: d.candidate_id, sig: sig.signature_id },
              }))}
            />
          </>
        ) : (
          <p className={cn(TILE, 'm-0 flex items-center gap-2 px-3 py-3 text-[13px] text-ink-2')}>
            <ProhibitIcon aria-hidden className="size-4 shrink-0 text-ink-3" />
            {notScored.replace(/^not scored: /, 'Not scored: ')}
          </p>
        )}
      </div>
    );
  }

  if (drug) {
    const rows = scored
      .map((s) => ({ s, c: cellOf(drug, s) }))
      .filter((x): x is { s: Signature; c: { kind: 'score'; value: number } } => x.c.kind === 'score')
      .sort((a, b) => a.c.value - b.c.value);
    const reversing = rows.filter((x) => x.c.value < 0).length;
    return (
      <div aria-live="polite" className="flex flex-col gap-3">
        <div>
          <Eyebrow icon={<PillIcon />}>Rank {drug.pool_rank}</Eyebrow>
          <h4 className="m-0 mt-1 truncate font-heading text-[22px] font-normal tracking-[-0.02em] text-ink">{drug.name}</h4>
        </div>
        <div className="flex items-end gap-6">
          <div>
            <p className="m-0 text-[11.5px] text-ink-3">Opposite to Alzheimer's</p>
            <p className="m-0 font-mono text-[40px] leading-none font-light tracking-[-0.04em] text-primary tabular-nums">
              {reversing}
              <span className="ml-1 text-[14px] text-ink-3">/ {rows.length} cell types</span>
            </p>
          </div>
          {drug.bulk_consensus != null && (
            <div>
              <p className="m-0 text-[11.5px] text-ink-3">Bulk score</p>
              <p className="m-0 font-mono text-[20px] leading-tight text-ink tabular-nums">{signed(drug.bulk_consensus)}</p>
            </div>
          )}
        </div>
        <ScoreBars
          limit={limit}
          onPick={onFocus}
          rows={rows.map(({ s, c }) => ({
            key: s.signature_id,
            label: `${s.region ?? s.cohort} · ${cellShort(s)}`,
            title: `${s.cohort} · ${regionName(s)} · ${cellName(s)}`,
            value: c.value,
            focus: { drug: drug.candidate_id, sig: s.signature_id },
          }))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-primary">
        <PillIcon aria-hidden className="size-5" />
      </span>
      <p className="m-0 text-[13px] text-ink-2">Pick a drug, a cell type or a cell</p>
    </div>
  );
}

function BackChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-full bg-frost/60 px-3 text-[12px] text-ink-2 ring-1 ring-ink/[0.08] transition-colors outline-none hover:bg-primary/8 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <ArrowLeftIcon aria-hidden className="size-3.5" />
      {children}
    </button>
  );
}
