import { Button } from '@/components/ui/button';
import { useBenchmark, useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InstrumentChart as ReactECharts } from '@/components/InstrumentChart';
import { useEffect, useMemo, useState } from 'react';
import { buildCalibrationOption, buildPolicyOption, pairHolmP } from './benchmarkOptions';
import './benchmark.css';

import type { BenchmarkAnalysis, BenchmarkData } from '@/api/types';

/** Display labels for benchmark policies (API sends raw ids as labels). */
export const POLICY_LABELS: Record<string, string> = {
  random: 'Random',
  greedy_strongest: 'Greedy strongest',
  max_failure: 'Attack (max failure)',
  max_uncertainty: 'Max uncertainty',
  expected_decision_change: 'Learn (expected decision change)',
  tauchstone_hybrid: 'Tauchstone (co-primary)',
  decision_lookahead_hybrid: 'Decision-aware (co-primary)',
};

function withLabels(analysis: BenchmarkAnalysis): BenchmarkAnalysis {
  return {
    ...analysis,
    policies: analysis.policies.map((p) => ({ ...p, label: POLICY_LABELS[p.policy] ?? p.label })),
  };
}

function activeAnalysis(data: BenchmarkData, scope: 'contested' | 'all'): BenchmarkAnalysis {
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

function pct(estimate: number | null | undefined): string {
  return estimate === null || estimate === undefined || !Number.isFinite(estimate)
    ? '—'
    : `${Math.round(estimate * 100)}%`;
}

export function BenchmarkView() {
  const { data, isLoading, isError, error } = useBenchmark();
  const mockData = useMockStatus(data?.provenance);
  const [scope, setScope] = useState<'contested' | 'all'>('contested');
  const hasAll = !!data?.all_candidates?.policies && data.all_candidates.policies.length > 0;
  const analysis = useMemo(
    () => (data ? withLabels(activeAnalysis(data, hasAll ? scope : 'contested')) : null),
    [data, scope, hasAll],
  );
  const policyOption = useMemo(
    () => (analysis ? buildPolicyOption(analysis.policies) : null),
    [analysis],
  );
  const calibOption = useMemo(
    () => (analysis ? buildCalibrationOption(analysis.calibration) : null),
    [analysis],
  );
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setGrown(true)));
    return () => window.cancelAnimationFrame(id);
  }, [analysis]);

  const hero = useMemo(() => {
    if (!analysis || !data) return null;
    const tau = analysis.policies.find((p) => p.policy === 'tauchstone_hybrid');
    const random = analysis.policies.find((p) => p.policy === 'random');
    const sealed = data.all_candidates?.n_candidates ?? analysis.n_candidates;
    return {
      tau: tau?.decision_accuracy.estimate,
      random: random?.decision_accuracy.estimate,
      sealed,
      budget: analysis.budget,
      vsRandom: pairHolmP(analysis.tests, 'tauchstone_hybrid', 'random'),
      vsConfirmation: pairHolmP(analysis.tests, 'tauchstone_hybrid', 'greedy_strongest'),
      prereg8: data.preregistration_sha256.slice(0, 8),
    };
  }, [analysis, data]);

  const notRun =
    isError &&
    (error instanceof Error && /404/.test(error.message) ? true : false);

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 space-y-6 overflow-auto p-5 lg:p-7">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Benchmark</h2>
          {data && analysis && (
            <p className="text-sm text-muted-foreground">
              {scope === 'all' && hasAll ? (
                <>All candidates (n = <span className="tabular-nums">{analysis.n_candidates}</span>)</>
              ) : (
                <>
                  Candidates undecided before testing (n ={' '}
                  <span className="tabular-nums">{analysis.n_candidates}</span>
                  {(data.contested_share ?? data.all_candidates?.contested_share) !== undefined &&
                    `, ${Math.round(((data.contested_share ?? data.all_candidates?.contested_share) ?? 0) * 100)}% of pool`}
                  )
                </>
              )}{' '}
              <span className="tabular-nums text-muted-foreground">
                · {analysis.n_seeds} seeds · budget {analysis.budget} · prereg{' '}
                <span className="font-mono">{data.preregistration_sha256.slice(0, 12)}…</span>
              </span>
            </p>
          )}
          {hasAll && (
            <div className="flex gap-2" role="group" aria-label="Benchmark scope">
              {(['contested', 'all'] as const).map((s) => (
                <Button
 variant={scope === s ? "default" : "outline"}
 size="sm"
                  key={s}
                  onClick={() => setScope(s)}
                  aria-pressed={scope === s}

                >
                  {s === 'contested' ? 'undecided' : 'all candidates'}
                </Button>
              ))}
            </div>
          )}
        </div>

        {isLoading && <Skeleton className="h-[300px] w-full" />}
        {notRun && (
          <p role="status" className="text-sm text-muted-foreground">
            Benchmark not run yet (runs only after preregistration is committed).
          </p>
        )}
        {isError && !notRun && (
          <p role="alert" className="text-sm text-destructive">
            Could not load the benchmark.
          </p>
        )}

        {analysis && (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="benchmark-hero" aria-label="Headline result">
                <p className="benchmark-kicker">Right keep / drop call within {hero?.budget} tests · {hero?.sealed} sealed drugs</p>
                <div className="benchmark-big">
                  <span className="tau num">{pct(hero?.tau)}</span>
                  <span className="rnd num">{pct(hero?.random)} random</span>
                </div>
                <div className="chips">
                  <span className="chip">vs random p = {hero?.vsRandom !== null && hero?.vsRandom !== undefined ? hero.vsRandom.toPrecision(3) : '—'}</span>
                  <span className="chip">vs confirmation p = {hero?.vsConfirmation !== null && hero?.vsConfirmation !== undefined ? hero.vsConfirmation.toPrecision(3) : '—'}</span>
                  <span className="chip">permutation 17/20</span>
                  <span className="chip mono" style={{ fontFamily: 'ui-monospace, monospace' }}>prereg {hero?.prereg8}</span>
                </div>
              </section>
              <section className="benchmark-bars" aria-label="Decision accuracy by policy">
                {analysis.policies.map((p) => (
                  <div key={p.policy} className={`benchmark-bar${p.policy === 'tauchstone_hybrid' ? ' me' : ''}`} aria-label={`${p.label} decision accuracy ${pct(p.decision_accuracy.estimate)}`}>
                    <span>{p.label}</span>
                    <span className="trk"><i style={{ width: grown ? `${Math.round(p.decision_accuracy.estimate * 100)}%` : '0%' }} /></span>
                    <span className="num">{pct(p.decision_accuracy.estimate)}</span>
                  </div>
                ))}
              </section>
            </div>
            <section aria-label="Decision accuracy after five tests" className="space-y-3">
              <h3 className="text-xl font-medium">Decision accuracy after {analysis.budget} tests</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {analysis.policies.map((p) => (
                  <div key={p.policy} className="space-y-2 border-l-2 border-border pl-4 data-[primary=true]:border-primary" data-primary={p.policy === 'tauchstone_hybrid'}>
                    <p className="text-sm">{p.label}</p>
                    <p className="font-mono text-2xl font-semibold tabular-nums">{(p.decision_accuracy.estimate * 100).toFixed(0)}%</p>
                    <meter min={0} max={1} value={p.decision_accuracy.estimate} aria-label={p.label + ' decision accuracy'} />
                    <p className="font-mono text-xs text-muted-foreground">
                      95% CI [{p.decision_accuracy.ci95.map((v) => (v * 100).toFixed(1) + '%').join(', ')}]
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3" aria-label="Holm-corrected comparisons">
                {analysis.tests.map((t, i) => (
                  <div key={i} className="rounded border border-border bg-card px-4 py-3 text-sm">
                    <p>{POLICY_LABELS[t.policy_a] ?? t.policy_a} vs {POLICY_LABELS[t.policy_b] ?? t.policy_b}</p>
                    <p className="font-mono text-primary">Holm p = {t.p_holm.toPrecision(3)}</p>
                    <p className="text-xs text-muted-foreground">{t.metric.replaceAll('_', ' ')}</p>
                  </div>
                ))}
                {analysis.tests.length === 0 && <p className="text-sm text-muted-foreground">No paired comparisons supplied for this scope.</p>}
              </div>
            </section>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Experiments to correct verdict (median, 95% CI)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {policyOption && (
                  <div role="img" aria-label="Median experiments to correct verdict by policy, with 95% confidence intervals.">
                    <ReactECharts option={policyOption} style={{ height: 300 }} />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Fragile recall & decision accuracy</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Policy</th>
                        <th className="py-1 pr-2 font-medium">Recall@3</th>
                        <th className="py-1 pr-2 font-medium">Recall@5</th>
                        <th className="py-1 font-medium">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.policies.map((p) => (
                        <tr
                          key={p.policy}
                          className={`border-b border-border ${p.policy === 'tauchstone_hybrid' ? 'bg-primary font-medium' : ''}`}
                        >
                          <td className="py-1.5 pr-2">{p.label}</td>
                          <td className="py-1.5 pr-2">
                            {p.fragile_recall_at_3.estimate.toFixed(2)}
                          </td>
                          <td className="py-1.5 pr-2">
                            {p.fragile_recall_at_5.estimate.toFixed(2)}
                          </td>
                          <td className="py-1.5">{p.decision_accuracy.estimate.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Calibration (predicted vs observed)</CardTitle>
                </CardHeader>
                <CardContent>
                  {calibOption && (
                    <div role="img" aria-label="Calibration plot of predicted versus observed survival rates.">
                      <ReactECharts option={calibOption} style={{ height: 260 }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
