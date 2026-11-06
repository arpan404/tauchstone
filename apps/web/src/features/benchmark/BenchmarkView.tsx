import { useBenchmark } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReactECharts from 'echarts-for-react';
import { useMemo } from 'react';
import { buildCalibrationOption, buildPolicyOption } from './benchmarkOptions';

export function BenchmarkView() {
  const { data, isLoading, isError, error } = useBenchmark();
  const policyOption = useMemo(() => (data ? buildPolicyOption(data.policies) : null), [data]);
  const calibOption = useMemo(() => (data ? buildCalibrationOption(data.calibration) : null), [data]);

  const notRun =
    isError &&
    (error instanceof Error && /404/.test(error.message) ? true : false);

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Benchmark</h2>
          {data && (
            <p className="text-sm tabular-nums text-neutral-500">
              {data.n_candidates} candidates · {data.n_seeds} seeds · budget {data.budget} ·
              prereg <span className="font-mono">{data.preregistration_sha256.slice(0, 12)}…</span>
            </p>
          )}
        </div>

        {isLoading && <Skeleton className="h-[300px] w-full" />}
        {notRun && (
          <p role="status" className="text-sm text-neutral-600">
            Benchmark not run yet (runs only after preregistration is committed).
          </p>
        )}
        {isError && !notRun && (
          <p role="alert" className="text-sm text-red-700">
            Could not load the benchmark.
          </p>
        )}

        {data && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Experiments to correct verdict (median, 95% CI)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {policyOption && (
                  <div role="img" aria-label="Policy comparison chart. Tauchstone hybrid needs the fewest experiments.">
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
                      <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                        <th className="py-1 pr-2 font-medium">Policy</th>
                        <th className="py-1 pr-2 font-medium">Recall@3</th>
                        <th className="py-1 pr-2 font-medium">Recall@5</th>
                        <th className="py-1 font-medium">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.policies.map((p) => (
                        <tr
                          key={p.policy}
                          className={`border-b border-neutral-100 ${p.policy === 'tauchstone_hybrid' ? 'bg-teal-50/60 font-medium' : ''}`}
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
