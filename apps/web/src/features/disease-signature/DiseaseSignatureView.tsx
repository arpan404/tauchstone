import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowClockwiseIcon,
  BrainIcon,
  DnaIcon,
  ListMagnifyingGlassIcon,
  SealCheckIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { useMockStatus, useSignature } from '@/api/hooks';
import { EmptyState, NumberTicker, Panel, StatusBadge } from '@/components/system';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Schema } from '@/api/types';
import { GeneMatchTable, GeneSearch } from './GeneSearch';
import { focusGene, matchGenes } from './geneMatch';
import { SignCheckTable } from './SignCheckTable';
import { VolcanoPlot } from './VolcanoPlot';
import { ProvenanceFooter } from './ProvenanceFooter';

type Gene = Schema<'GeneStat'>;
const NO_GENES: Gene[] = [];
const fmtInt = (n: number) => n.toLocaleString('en-US');

function Tag({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-frost/60 px-2.5 py-1 font-mono text-[11.5px] text-ink-2 ring-1 ring-ink/[0.07] [&>svg]:size-3.5 [&>svg]:text-ink-3">
      {icon}
      {children}
    </span>
  );
}

function Metric({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="m-0 mt-1 font-mono text-[22px] leading-none font-normal tracking-[-0.03em] whitespace-nowrap text-ink tabular-nums">
        {children}
      </dd>
    </div>
  );
}

export function DiseaseSignatureView() {
  const { data, isLoading, isError, refetch } = useSignature('GSE132903');
  const mock = useMockStatus(data?.provenance);
  const genes = data?.genes ?? NO_GENES;

  const [query, setQueryRaw] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    setPicked(null);
  }, []);

  const matches = useMemo(() => matchGenes(genes, query), [genes, query]);
  const focus = useMemo(
    () => (picked ? (matches.find((g) => g.entrez_id === picked) ?? null) : focusGene(matches, query)),
    [matches, picked, query],
  );
  const highlight = useMemo(() => (focus ? [focus] : matches.length <= 8 ? matches : NO_GENES), [focus, matches]);

  const signCheck = data?.sign_check ?? [];
  const passed = signCheck.filter((r) => r.matches).length;
  const allPass = signCheck.length > 0 && passed === signCheck.length;
  const sentUp = useMemo(() => genes.filter((g) => g.query_set === 'up').length, [genes]);
  const sentDown = useMemo(() => genes.filter((g) => g.query_set === 'down').length, [genes]);
  const picks = signCheck.map((r) => r.symbol).slice(0, 4);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-[1360px] space-y-4">
          {isLoading && <Skeleton className="h-[480px] w-full rounded-[18px]" />}
          {isError && (
            <EmptyState
              icon={<DnaIcon />}
              className="min-h-64"
              title={<span role="alert">Could not load the signature</span>}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <ArrowClockwiseIcon /> Retry
                </Button>
              }
            />
          )}
          {data && (
            <>
              <section aria-labelledby="signature-title" className="glass @container min-w-0 px-7 py-6 max-md:px-5 max-md:py-5">
                <div className="grid gap-x-8 gap-y-6 @4xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @6xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col">
                    <p className="m-0 flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
                      <DnaIcon aria-hidden className="size-4 text-primary" />
                      Disease signature · {data.cohort}
                    </p>
                    <h2
                      id="signature-title"
                      className="m-0 mt-2 font-heading text-[44px] leading-[1.06] font-normal tracking-[-0.035em] text-ink max-md:text-[32px]"
                    >
                      Alzheimer's vs control
                    </h2>
                    <div aria-label="Cohort summary" className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Tag icon={<BrainIcon />}>{data.tissue}</Tag>
                      <Tag>{data.method}</Tag>
                      <Tag icon={<UsersThreeIcon />}>
                        {data.n_ad} Alzheimer's / {data.n_control} control
                      </Tag>
                      {mock && <StatusBadge tone="gap">Synthetic data</StatusBadge>}
                    </div>

                    <dl className="m-0 mt-7 flex flex-col gap-5">
                      <div className="min-w-0">
                        <dt className="text-[11.5px] text-ink-3">Genes at FDR &lt; 0.05</dt>
                        <dd className="m-0 mt-1 flex items-baseline gap-2 font-mono whitespace-nowrap tabular-nums">
                          <span className="text-[56px] leading-[0.92] font-light tracking-[-0.045em] text-primary max-md:text-[42px]">
                            <NumberTicker value={data.n_fdr05 ?? 0} />
                          </span>
                          <span className="text-[13px] text-ink-3">/ {fmtInt(genes.length)} tested</span>
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-8 gap-y-4">
                        <Metric label="Sent to LINCS">
                          {sentUp}
                          <span className="ml-1 text-[12px] text-ink-3">up</span>
                          <span className="mx-1.5 text-ink-3">·</span>
                          {sentDown}
                          <span className="ml-1 text-[12px] text-ink-3">down</span>
                        </Metric>
                        {signCheck.length > 0 && (
                          <Metric label="Sign check">
                            <span className={allPass ? 'text-ok' : 'text-bad'}>
                              {passed}
                              <span className="text-[14px]"> / {signCheck.length}</span>
                            </span>
                          </Metric>
                        )}
                      </div>
                    </dl>

                    <GeneSearch
                      value={query}
                      onChange={setQuery}
                      count={matches.length}
                      picks={picks}
                      className="mt-7 @4xl:mt-auto @4xl:pt-7"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2.5 rounded-full bg-[var(--warm)]" /> higher in Alzheimer's
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2.5 rounded-full bg-primary" /> lower in Alzheimer's
                      </span>
                      <span>large dots = sent to LINCS</span>
                    </div>
                    <VolcanoPlot genes={genes} highlight={highlight} focusId={focus?.entrez_id ?? null} onPick={setQuery} height={460} />
                  </div>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {signCheck.length > 0 && (
                  <Panel
                    icon={<SealCheckIcon />}
                    title="Sign check on known Alzheimer's genes"
                    caption="t statistic · positive = higher in Alzheimer's"
                    actions={
                      <StatusBadge
                        tone={allPass ? 'ok' : 'bad'}
                        className="font-mono"
                        tip="Each marker gene must move in the direction reported for Alzheimer's cortex before the signature is used."
                      >
                        <SealCheckIcon weight="fill" aria-hidden />
                        {passed} of {signCheck.length} {allPass ? 'pass' : 'match'}
                      </StatusBadge>
                    }
                    flush
                    bodyClassName="px-2 pb-2"
                  >
                    <SignCheckTable rows={signCheck} focusSymbol={focus?.symbol ?? null} onFocus={setQuery} />
                  </Panel>
                )}
                <Panel
                  icon={<ListMagnifyingGlassIcon />}
                  title="Gene lookup"
                  caption={query.trim() ? `Matches for "${query.trim()}"` : 'search above or click a point'}
                  flush
                  aria-label="Inspect signature genes"
                >
                  {query.trim() ? (
                    matches.length > 0 ? (
                      <GeneMatchTable matches={matches} focusId={focus?.entrez_id ?? null} onFocus={(g) => setPicked(g.entrez_id)} />
                    ) : (
                      <p className="m-0 px-5 pt-2 pb-6 text-[13px] text-ink-3">No gene in this signature matches.</p>
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2.5 px-5 pt-4 pb-8 text-center">
                      <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-primary">
                        <ListMagnifyingGlassIcon className="size-5" aria-hidden />
                      </span>
                      <p className="m-0 text-[13px] text-ink-2">Type a gene symbol or Entrez ID</p>
                    </div>
                  )}
                </Panel>
              </div>

              <ProvenanceFooter provenance={data.provenance} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
