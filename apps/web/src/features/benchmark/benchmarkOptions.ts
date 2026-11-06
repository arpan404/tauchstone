import type { Schema } from '@/api/schema';

type Policy = Schema<'PolicyResult'>;

/** Median experiments-to-correct-verdict with 95% CI whiskers; hybrid emphasised. */
export function buildPolicyOption(policies: Policy[]): Record<string, unknown> {
  const labels = policies.map((p) => p.label);
  return {
    grid: { left: 150, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: 'median experiments to correct verdict (fewer is better)' },
    yAxis: { type: 'category', data: labels, inverse: true, axisLabel: { fontSize: 11 } },
    tooltip: {
      trigger: 'item',
      formatter: (p: { data?: number[]; seriesName?: string }) =>
        `${labels[(p.data?.[3] as number) ?? 0] ?? ''}<br/>median ${(p.data?.[0] as number)?.toFixed(2)} · 95% CI [${(p.data?.[1] as number)?.toFixed(2)}, ${(p.data?.[2] as number)?.toFixed(2)}]`,
    },
    series: [
      {
        type: 'custom',
        name: 'policy CI',
        renderItem: (
          params: { coordSys?: unknown },
          api: {
            value: (dim: number) => number;
            coord: (pt: number[]) => number[];
          },
        ) => {
          void params;
          const idx = api.value(3);
          const median = api.coord([api.value(0), idx]);
          const lo = api.coord([api.value(1), idx]);
          const hi = api.coord([api.value(2), idx]);
          const isHybrid = policies[idx]?.policy === 'tauchstone_hybrid';
          const color = isHybrid ? '#0f766e' : '#a3a3a3';
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: lo[0], y1: median[1], x2: hi[0], y2: median[1] }, style: { stroke: color, lineWidth: isHybrid ? 3 : 2 } },
              { type: 'circle', shape: { cx: median[0], cy: median[1], r: isHybrid ? 6 : 4 }, style: { fill: color } },
            ],
          };
        },
        data: policies.map((p, i) => [
          p.experiments_to_correct_verdict.median,
          p.experiments_to_correct_verdict.ci95[0],
          p.experiments_to_correct_verdict.ci95[1],
          i,
        ]),
      },
    ],
  };
}

/** Calibration / reliability plot: predicted vs observed with the diagonal. */
export function buildCalibrationOption(
  bins: { mean_predicted: number; observed_rate: number }[],
): Record<string, unknown> {
  return {
    grid: { left: 44, right: 16, top: 24, bottom: 32 },
    xAxis: { type: 'value', min: 0, max: 1, name: 'mean predicted', nameLocation: 'middle', nameGap: 26 },
    yAxis: { type: 'value', min: 0, max: 1, name: 'observed rate' },
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'line',
        name: 'ideal',
        data: [
          [0, 0],
          [1, 1],
        ],
        lineStyle: { color: '#a3a3a3', type: 'dashed' },
        symbol: 'none',
      },
      {
        type: 'scatter',
        name: 'bins',
        data: bins.map((b) => [b.mean_predicted, b.observed_rate]),
        symbolSize: 10,
        itemStyle: { color: '#0f766e' },
      },
    ],
  };
}
