import { useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowClockwise, ChartScatter } from '@phosphor-icons/react';
import { useBenchmark, useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { InstrumentChart } from '@/components/InstrumentChart';
import { EmptyState, NumberTicker, Panel, StatusBadge, Term } from '@/components/system';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from 'cn';
import {
  CO_PRIMARY,
  POLICY_NAMES,
  buildCalibrationOption,
  formatP,
  metricLabel,
  niceDomain,
  pairHolmP,
  pairMetric,
  pairTip,
  policyName,
  tiedWith,
} from './benchmarkOptions';
import { IntervalPlot, type IntervalRow } from './IntervalPlot';

import type { BenchmarkAnalysis, BenchmarkData } from '@/api/types';

type Scope = 'contested' | 'all';
type Policy = BenchmarkAnalysis['policies'][number];

/** Documented permutation gate result (README, integrity log): 17 of 20 compounds, gate needs 20. */
const PERMUTATION_GATE = '17/20';
const PERMUTATION_GATE_TIP = '17/20 top compounds at p_perm < 0.05; gate required 20/20.';

function TipBadge({ tip, children, ...props }: { tip: string; children: ReactNode } & Parameters<typeof StatusBadge>[0]) {
  return (
    <Tooltip>
      <TooltipTrigger render={<StatusBadge tabIndex={0} {...props} />}>{children}</TooltipTrigger>
      <TooltipContent className="max-w-72 text-left leading-snug">{tip}</TooltipContent>
    </Tooltip>
  );
}

function activeAnalysis(data: BenchmarkData, scope: Scope): BenchmarkAnalysis {
  const all = data.all_candidates;
  if (scope === 'all' && all?.policies && all.policies.length > 0) {
    return {
      n_candidates: all.n_candidates ?? data.n_candidates,
      n_seeds: all.n_seeds ?? data.n_seeds,
      budget: all.budget ?? data.budget,
      policies: all.policies,
      calibration: all.calibration ?? data.calibration,
      tests: all.tests ?? [],
    };
  }
  return {
    n_candidates: data.n_candidates,
    n_seeds: data.n_seeds,
    budget: data.budget,
    policies: data.policies,
    calibration: data.calibration,
    tests: data.tests,
  };
}

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const pct = (v: number | null | undefined) => (finite(v) ? `${Math.round(v * 100)}%` : 'n/a');
const isCoPrimary = (id: string) => (CO_PRIMARY as readonly string[]).includes(id);
const emphasis = (id: string): IntervalRow['emphasis'] =>
  id === 'tauchstone_hybrid' ? 'accent' : id === 'decision_lookahead_hybrid' ? 'ink' : 'muted';

function PolicyLabel({ id }: { id: string }) {
  const p = POLICY_NAMES[id];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn('shrink-0', id === 'tauchstone_hybrid' ? 'font-semibold text-ink' : 'text-ink')}>
        {policyName(id)}
      </span>
      {isCoPrimary(id) ? (
        <Term term="coPrimary" className="shrink-0 text-[11px] font-medium text-accent-ink">co-primary</Term>
      ) : (
        p?.detail && <span className="truncate text-[12px] text-ink-3">{p.detail}</span>
      )}
    </span>
  );
}

/** Highest first; on ties the Tauchstone co-primary leads. */
function byAccuracy(policies: Policy[]): Policy[] {
  return [...policies].sort(
    (a, b) =>
      b.decision_accuracy.estimate - a.decision_accuracy.estimate ||
      Number(b.policy === 'tauchstone_hybrid') - Number(a.policy === 'tauchstone_hybrid'),
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1.5">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="m-0 flex items-center gap-2">{children}</dd>
    </div>
  );
}

function Headline({ analysis, prereg }: { analysis: BenchmarkAnalysis; prereg: string }) {
  const find = (id: string) => analysis.policies.find((p) => p.policy === id)?.decision_accuracy.estimate;
  const tau = find('tauchstone_hybrid');
  const random = find('random');
  const aware = find('decision_lookahead_hybrid');
  const vsRandom = pairHolmP(analysis.tests, 'tauchstone_hybrid', 'random');
  const vsConfirmation = pairHolmP(analysis.tests, 'tauchstone_hybrid', 'greedy_strongest');
  const awareVsRandom = pairHolmP(analysis.tests, 'decision_lookahead_hybrid', 'random');
  const metric = pairMetric(analysis.tests, 'tauchstone_hybrid', 'random');
  const awareNotBetter = finite(awareVsRandom) && awareVsRandom >= 0.05;
  const ties = tiedWith(analysis.policies);
  const confirmationMetric = pairMetric(analysis.tests, 'tauchstone_hybrid', 'greedy_strongest');
  const awareMetric = pairMetric(analysis.tests, 'decision_lookahead_hybrid', 'random');
  return (
    <Panel aria-label="Headline result">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-10">
        <div className="flex flex-col justify-center gap-5">
          <p className="m-0 text-[13px] font-medium text-ink-2">
            <Term term="decisionAccuracy">Correct verdict within {analysis.budget} tests</Term>
          </p>
          <dl className="m-0 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <div className="flex items-end gap-4">
                <dd className="m-0 font-mono text-[64px] leading-[0.9] font-semibold tracking-[-0.04em] text-primary tabular-nums">
                  {finite(tau) ? <NumberTicker value={tau * 100} format={(v) => `${Math.round(v)}%`} /> : 'n/a'}
                </dd>
                <ul aria-label="Limits" className="m-0 flex list-none flex-col items-start gap-1 p-0 pb-0.5">
                  <li><StatusBadge tone="gap">Retrospective benchmark</StatusBadge></li>
                  {ties.length > 0 && (
                    <li><StatusBadge>{`Ties ${ties.join(' and ')}`}</StatusBadge></li>
                  )}
                </ul>
              </div>
              <dt className="mt-2.5 text-[12px] font-medium text-ink">Tauchstone</dt>
            </div>
            <div>
              <dd className="m-0 font-mono text-[32px] leading-none font-medium tracking-tight text-ink-3 tabular-nums">
                {pct(random)}
              </dd>
              <dt className="mt-2.5 text-[12px] text-ink-3">Random</dt>
            </div>
            <div>
              <dd className="m-0 font-mono text-[32px] leading-none font-medium tracking-tight text-ink-2 tabular-nums">
                {pct(aware)}
              </dd>
              <dt className="mt-2.5 text-[12px] text-ink-3">Decision-aware</dt>
            </div>
          </dl>
        </div>
        <dl className="m-0 divide-y divide-line border-line lg:border-l lg:pl-8">
          {metric && (
            <div className="pb-1.5 text-[12px] font-medium text-ink-2">
              <Term term="holmP">Holm p</Term> · {metricLabel(metric)}
            </div>
          )}
          <Fact label="Tauchstone vs random">
            <TipBadge tone="accent" className="font-mono" tip={pairTip(analysis, 'tauchstone_hybrid', 'random', metric)}>
              {formatP(vsRandom)}
            </TipBadge>
          </Fact>
          <Fact label="Tauchstone vs confirmation">
            <TipBadge tone="accent" className="font-mono" tip={pairTip(analysis, 'tauchstone_hybrid', 'greedy_strongest', confirmationMetric)}>
              {formatP(vsConfirmation)}
            </TipBadge>
          </Fact>
          <Fact label="Decision-aware vs random">
            {awareNotBetter && <span className="text-[12px] text-ink-2">not better</span>}
            <TipBadge className="font-mono" tip={pairTip(analysis, 'decision_lookahead_hybrid', 'random', awareMetric)}>
              {formatP(awareVsRandom)}
            </TipBadge>
          </Fact>
          <Fact label="Permutation gate">
            <TipBadge tone="bad" className="font-mono" tip={PERMUTATION_GATE_TIP}>
              {PERMUTATION_GATE} not met
            </TipBadge>
          </Fact>
          <Fact label="Preregistration">
            <StatusBadge className="font-mono" title={prereg}>{prereg.slice(0, 8)}</StatusBadge>
          </Fact>
        </dl>
      </div>
    </Panel>
  );
}

function PairwiseTable({ tests }: { tests: BenchmarkAnalysis['tests'] }) {
  const tally = new Map<string, number>();
  for (const t of tests) tally.set(t.metric, (tally.get(t.metric) ?? 0) + 1);
  const primary = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const rowBadge = (metric: string) =>
    metric === primary
      ? null
      : primary && metric === `${primary}_head_to_head_descriptive`
        ? 'descriptive'
        : metricLabel(metric);
  return (
    <Panel
      title="Pairwise tests"
      flush
      aria-label="Holm-corrected comparisons"
      actions={primary && <span className="text-[12px] text-ink-3">{metricLabel(primary)}</span>}
    >
      {tests.length === 0 ? (
        <p className="m-0 p-4 text-[13px] text-ink-3">No paired tests in this scope</p>
      ) : (
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow className="border-line bg-surface-2 hover:bg-surface-2">
              <TableHead className="h-8 pl-4 text-[12px] font-medium text-ink-3">Comparison</TableHead>
              <TableHead className="h-8 pr-4 text-right text-[12px] font-medium text-ink-3">
                <Term term="holmP">Holm p</Term>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests.map((t, i) => {
              const sig = t.p_holm < 0.05;
              const badge = rowBadge(t.metric);
              return (
                <TableRow key={i} className="border-line hover:bg-surface-2">
                  <TableCell className="h-8 py-1 pl-4">
                    <span className="flex items-center gap-1.5">
                      <span className={cn(t.policy_a === 'tauchstone_hybrid' && 'font-medium')}>{policyName(t.policy_a)}</span>
                      <span className="text-ink-3">vs</span>
                      {policyName(t.policy_b)}
                      {badge && <StatusBadge className="ml-1 h-5 px-1.5 text-[11px]">{badge}</StatusBadge>}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'h-8 py-1 pr-4 text-right font-mono tabular-nums',
                      sig ? 'font-medium text-accent-ink' : 'text-ink-3',
                    )}
                  >
                    {formatP(t.p_holm)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function RecallTable({ policies }: { policies: Policy[] }) {
  return (
    <Panel title="Fragile recall" flush>
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow className="border-line bg-surface-2 hover:bg-surface-2">
            <TableHead className="h-8 pl-4 text-[12px] font-medium text-ink-3">Policy</TableHead>
            <TableHead className="h-8 text-right text-[12px] font-medium text-ink-3">@3</TableHead>
            <TableHead className="h-8 pr-4 text-right text-[12px] font-medium text-ink-3">@5</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((p) => (
            <TableRow
              key={p.policy}
              className={cn('border-line hover:bg-surface-2', p.policy === 'tauchstone_hybrid' && 'bg-accent-soft/60 hover:bg-accent-soft')}
            >
              <TableCell className="py-1.5 pl-4">{policyName(p.policy)}</TableCell>
              <TableCell className="py-1.5 text-right font-mono tabular-nums">{p.fragile_recall_at_3.estimate.toFixed(2)}</TableCell>
              <TableCell className="py-1.5 pr-4 text-right font-mono tabular-nums">{p.fragile_recall_at_5.estimate.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading benchmark">
      <Skeleton className="h-[188px] w-full rounded-lg" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-[360px] rounded-lg" />
        <Skeleton className="h-[360px] rounded-lg" />
      </div>
    </div>
  );
}

export function BenchmarkView() {
  const { data, isLoading, isError, error, refetch } = useBenchmark();
  const mockData = useMockStatus(data?.provenance);
  const reduce = useReducedMotion();
  const [scope, setScope] = useState<Scope>('contested');
  const hasAll = !!data?.all_candidates?.policies && data.all_candidates.policies.length > 0;
  const analysis = useMemo(
    () => (data ? activeAnalysis(data, hasAll ? scope : 'contested') : null),
    [data, scope, hasAll],
  );
  const calibOption = useMemo(() => (analysis ? buildCalibrationOption(analysis.calibration) : null), [analysis]);

  const accuracy = useMemo(() => {
    if (!analysis) return null;
    const sorted = byAccuracy(analysis.policies);
    const { domain, ticks } = niceDomain(
      sorted.flatMap((p) => [p.decision_accuracy.estimate, ...p.decision_accuracy.ci95]),
      0.1,
      undefined,
      1,
    );
    const rows: IntervalRow[] = sorted.map((p) => ({
      key: p.policy,
      label: <PolicyLabel id={p.policy} />,
      ariaLabel: `${policyName(p.policy)} decision accuracy ${pct(p.decision_accuracy.estimate)}`,
      value: p.decision_accuracy.estimate,
      ci: p.decision_accuracy.ci95 as [number, number],
      valueText: pct(p.decision_accuracy.estimate),
      ciText: p.decision_accuracy.ci95.map((v) => (v * 100).toFixed(1)).join(', '),
      emphasis: emphasis(p.policy),
    }));
    return { rows, domain, ticks };
  }, [analysis]);

  const experiments = useMemo(() => {
    if (!analysis) return null;
    const sorted = byAccuracy(analysis.policies);
    const { domain, ticks } = niceDomain(
      sorted.flatMap((p) => [p.experiments_to_correct_verdict.median, ...p.experiments_to_correct_verdict.ci95]),
      1,
      0,
    );
    const rows: IntervalRow[] = sorted.map((p) => ({
      key: p.policy,
      label: <PolicyLabel id={p.policy} />,
      ariaLabel: `${policyName(p.policy)} median experiments ${p.experiments_to_correct_verdict.median}`,
      value: p.experiments_to_correct_verdict.median,
      ci: p.experiments_to_correct_verdict.ci95 as [number, number],
      valueText: p.experiments_to_correct_verdict.median.toFixed(1),
      ciText: p.experiments_to_correct_verdict.ci95.map((v) => v.toFixed(1)).join(', '),
      emphasis: emphasis(p.policy),
    }));
    return { rows, domain, ticks };
  }, [analysis]);

  const notRun = isError && error instanceof Error && /404/.test(error.message);
  const allN = data?.all_candidates?.n_candidates;

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 overflow-auto p-6">
        <motion.div
          className="mx-auto max-w-[1360px] space-y-4"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {data && analysis && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {hasAll && (
                <ToggleGroup
                  aria-label="Benchmark scope"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[scope]}
                  onValueChange={(v) => v[0] && setScope(v[0] as Scope)}
                >
                  {(['contested', 'all'] as const).map((s) => (
                    <ToggleGroupItem
                      key={s}
                      value={s}
                      className="h-8 border-line-strong px-3 text-[13px] text-ink-2 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
                    >
                      {s === 'contested' ? <Term term="undecided" focusable={false}>Undecided</Term> : 'All candidates'}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              <dl className="m-0 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                {[
                  ['Candidates', allN && scope === 'contested' && hasAll ? `${analysis.n_candidates} / ${allN}` : String(analysis.n_candidates)],
                  ['Seeds', String(analysis.n_seeds)],
                  ['Budget', String(analysis.budget)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-1.5">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="m-0 font-mono text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {isLoading && <LoadingState />}
          {notRun && (
            <EmptyState icon={<ChartScatter />} title="Benchmark not run" />
          )}
          {isError && !notRun && (
            <EmptyState
              icon={<ChartScatter />}
              title={<span role="alert">Benchmark failed to load</span>}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <ArrowClockwise /> Retry
                </Button>
              }
            />
          )}

          {data && analysis && accuracy && experiments && (
            <>
              <Headline analysis={analysis} prereg={data.preregistration_sha256} />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <Panel
                  title={<Term term="decisionAccuracy">{`Decision accuracy after ${analysis.budget} tests`}</Term>}
                  aria-label="Decision accuracy after five tests"
                >
                  <IntervalPlot
                    rows={accuracy.rows}
                    domain={accuracy.domain}
                    ticks={accuracy.ticks}
                    tickFormat={(v) => `${Math.round(v * 100)}`}
                    valueHeader="Accuracy"
                  />
                </Panel>
                <PairwiseTable tests={analysis.tests} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                  title={<Term term="experimentsToVerdict">Experiments to correct verdict</Term>}
                  className="lg:col-span-2" actions={<span className="text-[12px] text-ink-3">median · fewer is better</span>}>
                  <IntervalPlot
                    rows={experiments.rows}
                    domain={experiments.domain}
                    ticks={experiments.ticks}
                    tickFormat={(v) => String(v)}
                    valueHeader="Median"
                  />
                </Panel>
                <RecallTable policies={byAccuracy(analysis.policies)} />
                <Panel title="Calibration">
                  {calibOption && (
                    <div role="img" aria-label="Calibration plot of predicted versus observed survival rates.">
                      <InstrumentChart option={calibOption} style={{ height: 248 }} />
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
