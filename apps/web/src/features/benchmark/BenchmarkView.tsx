import { useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowClockwiseIcon,
  ChartScatterIcon,
  ClockCounterClockwiseIcon,
  DiceFiveIcon,
  EqualsIcon,
  FingerprintIcon,
  GaugeIcon,
  HourglassIcon,
  ScalesIcon,
  ShieldCheckIcon,
  ShuffleIcon,
  StackIcon,
  TargetIcon,
  TestTubeIcon,
} from '@phosphor-icons/react';
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

/** Empty and error states sit on glass, not in a dashed grey box. */
const EMPTY = 'glass min-h-64 border-0 bg-transparent';
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

/** Solid blue gradient pill for the active segment; inactive hover is a blue tint, never the fill. */
const SEGMENT =
  'h-8 rounded-full px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-primary/8 hover:text-ink aria-pressed:bg-gradient-to-b aria-pressed:from-[#2b6fd3] aria-pressed:to-[#1453ad] aria-pressed:text-white aria-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)] aria-pressed:hover:from-[#3a7ddd] aria-pressed:hover:to-[#185cbc] aria-pressed:hover:text-white';
/** Frosted inner tile inside a glass panel. */
const TILE = 'rounded-xl bg-white/55 ring-1 ring-white/80';
/** Rounded table rows with no hard lines. */
const ROW = '[&>td]:border-0 [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl border-0 hover:bg-primary/6';
const HEAD_ROW = 'border-0 hover:bg-transparent';
const HEAD = 'h-8 text-[11.5px] font-medium text-ink-3';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-1.5 transition-colors hover:bg-white/60">
      <dt className="text-[12.5px] text-ink-2">{label}</dt>
      <dd className="m-0 flex items-center gap-2">{children}</dd>
    </div>
  );
}

function ScopeControl({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <ToggleGroup
      aria-label="Benchmark scope"
      spacing={1}
      value={[scope]}
      onValueChange={(v) => v[0] && onChange(v[0] as Scope)}
      className="rounded-full bg-ink/[0.045] p-0.5 ring-1 ring-ink/[0.06]"
    >
      {(['contested', 'all'] as const).map((s) => (
        <ToggleGroupItem key={s} value={s} className={SEGMENT}>
          {s === 'contested' ? <Term term="undecided" focusable={false} className="decoration-current/40">Undecided</Term> : 'All candidates'}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Headline({
  analysis,
  prereg,
  scopeControl,
  meta,
}: {
  analysis: BenchmarkAnalysis;
  prereg: string;
  scopeControl: ReactNode;
  meta: [string, string, ReactNode][];
}) {
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
    <section aria-label="Headline result" className="glass min-w-0 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-1.5 font-mono text-[12px] tracking-[0.02em] text-ink-3">
            <ShieldCheckIcon aria-hidden className="size-4 text-primary" /> Validation
          </p>
          <h2 className="m-0 mt-2 font-heading text-[32px] leading-[1.08] font-normal tracking-[-0.035em] text-ink sm:text-[44px]">
            <Term term="decisionAccuracy" className="decoration-ink/15 underline-offset-[7px]">
              Correct verdict within {analysis.budget} tests
            </Term>
          </h2>
        </div>
        {scopeControl}
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] min-[1400px]:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="m-0 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
            {meta.map(([k, v, icon]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span aria-hidden className="text-ink-3 [&>svg]:size-3.5">{icon}</span>
                <dt className="text-ink-3">{k}</dt>
                <dd className="m-0 font-mono text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <dl className="m-0 mt-auto flex flex-wrap items-end gap-x-10 gap-y-6">
            <div className="min-w-0">
              <dt className="mb-1 text-[12.5px] font-medium text-ink-2">Tauchstone</dt>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <dd className="m-0 font-mono text-[52px] leading-[0.95] font-light tracking-[-0.045em] text-primary tabular-nums sm:text-[58px]">
                  {finite(tau) ? <NumberTicker value={tau * 100} format={(v) => `${Math.round(v)}%`} /> : 'n/a'}
                </dd>
                <ul aria-label="Limits" className="m-0 flex list-none flex-col items-start gap-1.5 p-0">
                  <li>
                    <StatusBadge tone="gap"><ClockCounterClockwiseIcon aria-hidden /> Retrospective benchmark</StatusBadge>
                  </li>
                  {ties.length > 0 && (
                    <li><StatusBadge><EqualsIcon aria-hidden />{`Ties ${ties.join(' and ')}`}</StatusBadge></li>
                  )}
                  <li>
                    <TipBadge tone="bad" className="font-mono" tip={PERMUTATION_GATE_TIP}>
                      <ShuffleIcon aria-hidden />
                      <span className="font-sans">Permutation gate</span>{' '}
                      {PERMUTATION_GATE} not met
                    </TipBadge>
                  </li>
                </ul>
              </div>
            </div>
            <div className="flex items-end gap-7 pb-1">
              <div>
                <dd className="m-0 font-mono text-[30px] leading-none font-light tracking-[-0.03em] text-ink-3 tabular-nums">
                  {pct(random)}
                </dd>
                <dt className="mt-2 text-[12px] text-ink-3">Random</dt>
              </div>
              <div>
                <dd className="m-0 font-mono text-[30px] leading-none font-light tracking-[-0.03em] text-ink-2 tabular-nums">
                  {pct(aware)}
                </dd>
                <dt className="mt-2 text-[12px] text-ink-3">Decision-aware</dt>
              </div>
            </div>
          </dl>
        </div>
        <div className={cn(TILE, 'min-w-0 p-2')}>
          {metric && (
            <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-[12px] font-medium text-ink-2">
              <ScalesIcon aria-hidden className="size-4 text-primary" />
              <span><Term term="holmP">Holm p</Term> · {metricLabel(metric)}</span>
            </div>
          )}
          <dl className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] md:max-[1399px]:grid-cols-2 md:max-[1399px]:gap-x-2">
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
              {awareNotBetter && <span className="text-[12px] text-ink-3">not better</span>}
              <TipBadge className="font-mono" tip={pairTip(analysis, 'decision_lookahead_hybrid', 'random', awareMetric)}>
                {formatP(awareVsRandom)}
              </TipBadge>
            </Fact>
            <Fact label="Preregistration">
              <TipBadge className="font-mono" tip={`SHA-256 ${prereg}`}>
                <FingerprintIcon aria-hidden className="text-primary" />
                {prereg.slice(0, 8)}
              </TipBadge>
            </Fact>
          </dl>
        </div>
      </div>
    </section>
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
      icon={<ScalesIcon />}
      caption={primary ? metricLabel(primary) : undefined}
      aria-label="Holm-corrected comparisons"
      bodyClassName="px-3 pt-1 pb-3"
    >
      {tests.length === 0 ? (
        <p className="m-0 px-2 py-4 text-[13px] text-ink-3">No paired tests in this scope</p>
      ) : (
        <Table className="border-separate border-spacing-y-0.5 text-[13px]">
          <TableHeader className="[&_tr]:border-0">
            <TableRow className={HEAD_ROW}>
              <TableHead className={cn(HEAD, 'pl-3')}>Comparison</TableHead>
              <TableHead className={cn(HEAD, 'pr-3 text-right')}>
                <Term term="holmP">Holm p</Term>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests.map((t, i) => {
              const sig = t.p_holm < 0.05;
              const badge = rowBadge(t.metric);
              return (
                <TableRow key={i} className={ROW}>
                  <TableCell className="h-9 py-1 pl-3">
                    <span className="flex items-center gap-1.5">
                      <span className={cn(t.policy_a === 'tauchstone_hybrid' ? 'font-medium text-ink' : 'text-ink-2')}>{policyName(t.policy_a)}</span>
                      <span className="text-[12px] text-ink-3">vs</span>
                      <span className="text-ink-2">{policyName(t.policy_b)}</span>
                      {badge && <StatusBadge size="sm" className="ml-1">{badge}</StatusBadge>}
                    </span>
                  </TableCell>
                  <TableCell className="h-9 py-1 pr-3 text-right">
                    {sig ? (
                      <StatusBadge tone="accent" size="sm" className="font-mono tabular-nums">{formatP(t.p_holm)}</StatusBadge>
                    ) : (
                      <span className="pr-2 font-mono text-[12.5px] text-ink-3 tabular-nums">{formatP(t.p_holm)}</span>
                    )}
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
    <Panel title="Fragile recall" icon={<TargetIcon />} bodyClassName="px-3 pt-1 pb-3">
      <Table className="border-separate border-spacing-y-0.5 text-[13px]">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className={HEAD_ROW}>
            <TableHead className={cn(HEAD, 'pl-3')}>Policy</TableHead>
            <TableHead className={cn(HEAD, 'text-right')}>@3</TableHead>
            <TableHead className={cn(HEAD, 'pr-3 text-right')}>@5</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {policies.map((p) => {
            const tau = p.policy === 'tauchstone_hybrid';
            return (
              <TableRow key={p.policy} className={cn(ROW, tau && 'bg-primary/[0.07] hover:bg-primary/10')}>
                <TableCell className={cn('h-9 py-1 pl-3', tau ? 'font-medium text-ink' : 'text-ink-2')}>{policyName(p.policy)}</TableCell>
                <TableCell className={cn('py-1 text-right font-mono tabular-nums', tau && 'text-primary')}>{p.fragile_recall_at_3.estimate.toFixed(2)}</TableCell>
                <TableCell className={cn('py-1 pr-3 text-right font-mono tabular-nums', tau && 'text-primary')}>{p.fragile_recall_at_5.estimate.toFixed(2)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading benchmark">
      <Skeleton className="h-[260px] w-full rounded-[18px] bg-white/50" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Skeleton className="h-[360px] rounded-[18px] bg-white/50" />
        <Skeleton className="h-[360px] rounded-[18px] bg-white/50" />
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
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <motion.div
          className="mx-auto max-w-[1360px] space-y-4"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {isLoading && <LoadingState />}
          {notRun && (
            <EmptyState icon={<ChartScatterIcon />} title="Benchmark not run" className={EMPTY} />
          )}
          {isError && !notRun && (
            <EmptyState
              icon={<ChartScatterIcon />}
              className={EMPTY}
              title={<span role="alert">Benchmark failed to load</span>}
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <ArrowClockwiseIcon /> Retry
                </Button>
              }
            />
          )}

          {data && analysis && accuracy && experiments && (
            <>
              <Headline
                analysis={analysis}
                prereg={data.preregistration_sha256}
                scopeControl={hasAll && <ScopeControl scope={scope} onChange={setScope} />}
                meta={[
                  ['Candidates', allN && scope === 'contested' && hasAll ? `${analysis.n_candidates} / ${allN}` : String(analysis.n_candidates), <StackIcon key="c" />],
                  ['Seeds', String(analysis.n_seeds), <DiceFiveIcon key="s" />],
                  ['Budget', String(analysis.budget), <TestTubeIcon key="b" />],
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <Panel
                  title={<Term term="decisionAccuracy">{`Decision accuracy after ${analysis.budget} tests`}</Term>}
                  icon={<ChartScatterIcon />}
                  caption="dot = estimate · line = 95% CI"
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
                  icon={<HourglassIcon />}
                  caption="median · fewer is better"
                  className="lg:col-span-2"
                >
                  <IntervalPlot
                    rows={experiments.rows}
                    domain={experiments.domain}
                    ticks={experiments.ticks}
                    tickFormat={(v) => String(v)}
                    valueHeader="Median"
                  />
                </Panel>
                <RecallTable policies={byAccuracy(analysis.policies)} />
                <Panel title="Calibration" icon={<GaugeIcon />} caption="predicted vs observed survival">
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
