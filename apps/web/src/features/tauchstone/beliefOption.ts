import type { Schema } from '@/api/types';

/** Pure ECharts line-chart option builder for P(claim) across reveal steps. */
export function buildBeliefOption(points: { step: number; p: number }[]): Record<string, unknown> {
  return {
    textStyle: { color: '#a0b3ba', fontFamily: 'monospace' },
    grid: { left: 44, right: 16, top: 24, bottom: 30 },
    xAxis: {
      type: 'category',
      data: points.map((p) => (p.step === 0 ? 'start' : `+${p.step}`)),
      name: 'reveals',
      nameLocation: 'middle',
      nameGap: 24,
    },
    yAxis: { type: 'value', min: 0, max: 1, name: 'P(claim holds)' },
    tooltip: {
      trigger: 'axis',
      formatter: (ps: { data?: number }[]) => `P(claim holds) = ${(ps[0]?.data ?? 0).toFixed(3)}`,
    },
    series: [
      {
        type: 'line',
        data: points.map((p) => p.p),
        smooth: true,
        symbolSize: 8,
        lineStyle: { color: '#5de0cd', width: 3 },
        itemStyle: { color: '#5de0cd' },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#a16207', type: 'dashed' },
          label: { formatter: '0.5', fontSize: 10 },
          data: [{ yAxis: 0.5 }],
        },
      },
    ],
  };
}

export function beliefPoints(history: Schema<'RevealedOutcome'>[]): { step: number; p: number }[] {
  if (history.length === 0) return [];
  const pts = [{ step: 0, p: history[0].belief_before }];
  history.forEach((h, i) => pts.push({ step: i + 1, p: h.belief_after }));
  return pts;
}
