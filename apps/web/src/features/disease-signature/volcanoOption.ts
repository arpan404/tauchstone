import type { Schema } from '@/api/types';

export type GeneStat = Schema<'GeneStat'>;

export interface VolcanoPoint {
  x: number;
  y: number;
  symbol: string;
  fdr: number;
  group: 'up' | 'down' | 'ns' | 'query_up' | 'query_down';
}

/** Theme colour from a CSS variable, with a light-mode fallback for tests and SSR. */
function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function classOf(g: GeneStat): VolcanoPoint['group'] {
  if (g.fdr >= 0.05) return 'ns';
  if (g.query_set === 'up') return 'query_up';
  if (g.query_set === 'down') return 'query_down';
  return g.log2fc > 0 ? 'up' : 'down';
}

const negLog10 = (p: number) => -Math.log10(Math.max(p, 1e-300));

export function toVolcanoPoints(genes: GeneStat[]): VolcanoPoint[] {
  return genes.map((g) => ({
    x: g.log2fc,
    y: negLog10(g.p_value),
    symbol: g.symbol,
    fdr: g.fdr,
    group: classOf(g),
  }));
}

const GROUP_NAME: Record<VolcanoPoint['group'], string> = {
  ns: 'Not significant',
  up: "Up in Alzheimer's",
  down: "Down in Alzheimer's",
  query_up: 'Sent to LINCS, up',
  query_down: 'Sent to LINCS, down',
};

/**
 * Pure ECharts option builder (unit-testable, no chart instance). Colours come from theme tokens:
 * warm = higher in Alzheimer's, blue = lower. `highlight` genes are drawn on top with labels.
 */
export function buildVolcanoOption(
  genes: GeneStat[],
  animate: boolean,
  highlight: GeneStat[] = [],
  focusId: string | null = null,
): Record<string, unknown> {
  const blue = token('--ac', '#1558b8');
  const warm = token('--warm', '#e08a1e');
  const grey = token('--fa', '#9a9eab');
  const ink = token('--ink', '#14131a');
  const ink3 = token('--ink-3', '#687182');
  const line = token('--line', '#e5e8ed');
  const surface = token('--surface', '#ffffff');
  const dim = highlight.length > 0;
  // BH: the FDR 0.05 cut sits at the largest raw p among genes that pass it.
  const passing = genes.filter((g) => g.fdr < 0.05).map((g) => g.p_value);
  const fdrCut = passing.length ? Math.max(...passing) : null;
  const style: Record<VolcanoPoint['group'], { color: string; size: number; opacity: number }> = {
    ns: { color: grey, size: 4, opacity: 0.4 },
    up: { color: warm, size: 5, opacity: 0.45 },
    down: { color: blue, size: 5, opacity: 0.45 },
    query_up: { color: warm, size: 7, opacity: 0.95 },
    query_down: { color: blue, size: 7, opacity: 0.95 },
  };

  const series = (['ns', 'up', 'down', 'query_up', 'query_down'] as const).map((group) => ({
    name: GROUP_NAME[group],
    type: 'scatter',
    symbolSize: style[group].size,
    itemStyle: { color: style[group].color, opacity: style[group].opacity * (dim ? 0.55 : 1) },
    emphasis: { focus: 'series' },
    data: genes
      .filter((g) => classOf(g) === group)
      // `gene`, not `symbol`: ECharts reads a data item's `symbol` as its marker shape.
      .map((g) => ({ value: [g.log2fc, negLog10(g.p_value)], gene: g.symbol, fdr: g.fdr })),
    animationDelay: animate ? (idx: number) => Math.min(idx * 0.4, 600) : 0,
  }));

  const marked = {
    name: 'Searched genes',
    type: 'scatter',
    z: 10,
    animation: false,
    data: highlight.map((g) => {
      const focus = g.entrez_id === focusId || highlight.length === 1;
      const color = g.log2fc > 0 ? warm : blue;
      return {
        value: [g.log2fc, negLog10(g.p_value)],
        gene: g.symbol,
        fdr: g.fdr,
        symbolSize: focus ? 16 : 10,
        itemStyle: { color, borderColor: surface, borderWidth: 2, opacity: 1, shadowBlur: focus ? 12 : 0, shadowColor: color },
        label: {
          show: true,
          formatter: g.symbol,
          position: g.log2fc > 0 ? 'right' : 'left',
          distance: 8,
          color: ink,
          fontSize: focus ? 14 : 11.5,
          fontWeight: focus ? 600 : 500,
          fontFamily: 'Geist Mono Variable, monospace',
          backgroundColor: surface,
          borderRadius: 6,
          padding: [3, 6],
        },
      };
    }),
  };

  return {
    textStyle: { color: ink3, fontFamily: 'Geist Variable, sans-serif' },
    animationDuration: animate ? 700 : 0,
    animationDurationUpdate: 0,
    grid: { left: 56, right: 20, top: 14, bottom: 76 },
    legend: {
      bottom: 0,
      type: 'scroll',
      width: '96%',
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
      data: Object.values(GROUP_NAME),
      textStyle: { fontSize: 11.5, color: ink3 },
    },
    xAxis: {
      name: "log2 fold change, Alzheimer's vs control",
      nameLocation: 'middle',
      nameGap: 28,
      axisLine: { lineStyle: { color: line } },
      splitLine: { lineStyle: { color: line } },
      nameTextStyle: { fontSize: 11.5, color: ink3 },
    },
    yAxis: {
      name: '−log10 p',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { fontSize: 11.5, color: ink3 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: line } },
    },
    tooltip: {
      trigger: 'item',
      formatter: (p: { data?: { gene?: string; fdr?: number; value?: number[] } }) =>
        `<b>${p.data?.gene ?? ''}</b><br/>log2FC ${p.data?.value?.[0]?.toFixed(3) ?? ''}<br/>FDR ${p.data?.fdr?.toExponential(2) ?? ''}`,
    },
    series: [
      ...series,
      fdrCut !== null && {
        name: 'FDR 0.05',
        type: 'line',
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: ink3, type: 'dashed', opacity: 0.7 },
          label: { formatter: 'FDR 0.05', fontSize: 10.5, color: ink3, position: 'insideStartTop' },
          data: [{ yAxis: negLog10(fdrCut ?? 0.05) }],
        },
        data: [],
      },
      marked,
    ].filter(Boolean),
  };
}
