import type { Schema } from '@/api/schema';

type Candidate = Schema<'Candidate'>;

/** Pure ECharts heatmap option builder (candidates × cell lines, centred at 0). */
export function buildHeatmapOption(
  candidates: Candidate[],
  cellLines: string[],
): Record<string, unknown> {
  const data: [number, number, number][] = [];
  candidates.forEach((c, row) => {
    cellLines.forEach((cellId, col) => {
      const found = c.by_cell_line.find((b) => b.cell_id === cellId);
      data.push([col, row, found ? found.consensus : 0]);
    });
  });
  const values = data.map((d) => d[2]);
  const maxAbs = Math.max(0.5, ...values.map((v) => Math.abs(v)));

  return {
    grid: { left: 120, right: 60, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: cellLines, axisLabel: { fontSize: 10, rotate: 30 } },
    yAxis: {
      type: 'category',
      data: candidates.map((c) => `${String(c.rank).padStart(2, '0')} · ${c.name}`),
      axisLabel: { fontSize: 10 },
      inverse: true,
    },
    visualMap: {
      min: -maxAbs,
      max: maxAbs,
      calculable: true,
      orient: 'vertical',
      right: 0,
      top: 'middle',
      inRange: { color: ['#0f766e', '#f0fdfa', '#ffffff', '#fef3c7', '#b45309'] },
      text: ['reversal (−)', '(+)'],
    },
    tooltip: {
      formatter: (p: { value?: [number, number, number] }) => {
        if (!p.value) return '';
        const [col, row, v] = p.value;
        return `${candidates[row]?.name ?? ''} · ${cellLines[col] ?? ''}<br/>consensus ${v.toFixed(3)} (negative = reversal)`;
      },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
        emphasis: { itemStyle: { borderColor: '#333', borderWidth: 1 } },
      },
    ],
  };
}

/** Width % for the IQR range bar, relative to the data range [min, max]. */
export function iqrBar(lo: number, hi: number, min: number, max: number): { left: number; width: number } {
  const span = max - min || 1;
  const left = Math.max(0, Math.min(100, ((lo - min) / span) * 100));
  const right = Math.max(0, Math.min(100, ((hi - min) / span) * 100));
  return { left: Math.min(left, right), width: Math.abs(right - left) };
}
