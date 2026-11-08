import type { Schema } from '@/api/types';

export type GeneStat = Schema<'GeneStat'>;

export interface VolcanoPoint {
  x: number;
  y: number;
  symbol: string;
  fdr: number;
  group: 'up' | 'down' | 'ns' | 'query_up' | 'query_down';
}

export const TEAL = '#3667d9';
export const TEAL_LIGHT = '#7395e6';
export const AMBER = '#b56b29';
export const AMBER_LIGHT = '#d5a475';
export const GREY = '#a3a3a3';

export function classOf(g: GeneStat): VolcanoPoint['group'] {
  if (g.fdr >= 0.05) return 'ns';
  if (g.query_set === 'up') return 'query_up';
  if (g.query_set === 'down') return 'query_down';
  return g.log2fc > 0 ? 'up' : 'down';
}

const GROUP_STYLE: Record<VolcanoPoint['group'], { color: string; size: number }> = {
  ns: { color: GREY, size: 4 },
  up: { color: AMBER_LIGHT, size: 5 },
  down: { color: TEAL_LIGHT, size: 5 },
  query_up: { color: AMBER, size: 7 },
  query_down: { color: TEAL, size: 7 },
};

export function toVolcanoPoints(genes: GeneStat[]): VolcanoPoint[] {
  return genes.map((g) => ({
    x: g.log2fc,
    y: -Math.log10(Math.max(g.p_value, 1e-300)),
    symbol: g.symbol,
    fdr: g.fdr,
    group: classOf(g),
  }));
}

/** Pure ECharts option builder (unit-testable, no DOM). */
export function buildVolcanoOption(
  genes: GeneStat[],
  animate: boolean,
): Record<string, unknown> {
  const fdrLine = -Math.log10(0.05);
  const series = (['ns', 'up', 'down', 'query_up', 'query_down'] as const).map((group) => {
    const pts = genes.filter((g) => classOf(g) === group);
    return {
      name:
        group === 'ns'
          ? 'Not significant'
          : group === 'up'
            ? "Up in Alzheimer's"
            : group === 'down'
              ? "Down in Alzheimer's"
              : group === 'query_up'
                ? 'Sent to LINCS (up)'
                : 'Sent to LINCS (down)',
      type: 'scatter',
      symbolSize: GROUP_STYLE[group].size,
      itemStyle: { color: GROUP_STYLE[group].color, opacity: group === 'ns' ? 0.45 : 0.9 },
      emphasis: { focus: 'series' },
      data: pts.map((g) => ({
        value: [g.log2fc, -Math.log10(Math.max(g.p_value, 1e-300))],
        symbol: g.symbol,
        fdr: g.fdr,
      })),
      animationDelay: animate ? (idx: number) => Math.min(idx * 0.4, 600) : 0,
    };
  });

  return {
    textStyle: { color: '#687182', fontFamily: 'Geist Variable, sans-serif' },
    animationDuration: animate ? 700 : 0,
    grid: { left: 52, right: 28, top: 16, bottom: 88 },
    legend: { bottom: 0, type: 'scroll', width: '90%', textStyle: { fontSize: 11, color: '#687182' } },
    xAxis: {
      name: "log2FC (Alzheimer's vs control)",
      nameLocation: 'middle',
      nameGap: 30,
      splitLine: { lineStyle: { color: '#e5e8ed' } }, nameTextStyle: { fontSize: 11 },
    },
    yAxis: {
      name: '−log10 p-value',
      splitLine: { lineStyle: { color: '#e5e8ed' } }, nameTextStyle: { fontSize: 11 },
    },
    tooltip: {
      trigger: 'item',
      formatter: (p: { data?: { symbol?: string; fdr?: number; value?: number[] } }) =>
        `${p.data?.symbol ?? ''}<br/>log2FC ${p.data?.value?.[0]?.toFixed(3) ?? ''}<br/>FDR ${p.data?.fdr?.toExponential(2) ?? ''}`,
    },
    series: [
      ...series,
      {
        name: 'FDR 0.05',
        type: 'line',
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#525252', type: 'dashed' },
          label: { formatter: 'FDR 0.05', fontSize: 10, position: 'insideStartTop' },
          data: [{ yAxis: fdrLine }],
        },
        data: [],
      },
    ],
  };
}
