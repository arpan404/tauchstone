import type { Schema } from '@/api/types';
export type Data = Schema<'SingleCellExploratory'>;
export const notScored = 'not scored: fewer than 3 donors per group';
export const fmt = (n: number | null | undefined) => n == null ? 'unspecified' : n.toFixed(3);
export function ordered(data: Data) {
  const scored = new Set(data.signatures.filter(s => s.status === 'ok').map(s => s.cohort));
  return {
    drugs: [...data.drugs].sort((a, b) => a.pool_rank - b.pool_rank),
    // Cohorts with scored signatures first, so fully unscored cohorts sit at the end.
    signatures: [...data.signatures].sort((a, b) => Number(!scored.has(a.cohort)) - Number(!scored.has(b.cohort)) || a.cohort.localeCompare(b.cohort) || (a.region ?? '').localeCompare(b.region ?? '') || a.cell_type.localeCompare(b.cell_type)),
  };
}
export function scoreText(drug: Data['drugs'][number], signature: Data['signatures'][number]) {
  const score = drug.scores.find(s => s.signature_id === signature.signature_id);
  if (signature.status === 'insufficient_donors') return notScored;
  if (score?.consensus == null) return 'not scored: score unavailable';
  return `reversal ${fmt(score.consensus)}; WTCS ${fmt(score.scores?.wtcs)}; KS ${fmt(score.scores?.ks)}; cosine ${fmt(score.scores?.cosine)}`;
}
export function heatmapOption(data: Data, colors: { teal: string; warm: string; surface: string; muted: string }) {
  const { drugs, signatures } = ordered(data);
  const points = drugs.flatMap((drug, y) => [
    { value: [0, y, drug.bulk_consensus] },
    ...signatures.map((signature, x) => {
      const score = drug.scores.find(s => s.signature_id === signature.signature_id);
      const value = signature.status === 'ok' ? score?.consensus : null;
      return value == null ? {
        value: [x + 1, y, 0],
        itemStyle: { color: colors.muted, decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: colors.surface } },
        label: { show: true, formatter: '×', color: '#687182' },
      } : { value: [x + 1, y, value] };
    }),
  ]);
  const limit = Math.max(0.001, ...points.map(p => Math.abs(p.value[2]!)));
  return {
    animation: false,
    textStyle: { color: '#687182', fontFamily: 'Geist Variable, sans-serif' },
    grid: { left: 220, right: 20, top: 115, bottom: 65 },
    xAxis: { type: 'category', position: 'top', data: ['Bulk reference', ...signatures.map(s => s.cell_type.replaceAll('_', ' '))], axisLabel: { interval: 0, rotate: 55, fontSize: 12 } },
    yAxis: { type: 'category', inverse: true, data: drugs.map(d => `${d.pool_rank}. ${d.name}`), axisLabel: { fontSize: 14 } },
    visualMap: { min: -limit, max: limit, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: [colors.teal, colors.surface, colors.warm] }, text: ['Same direction as Alzheimer\'s', 'Opposite (reversal)'], seriesIndex: 0 },
    tooltip: { renderMode: 'richText', formatter: (p: { value: number[] }) => {
      const [x, y] = p.value;
      const drug = drugs[y!]!;
      return `${drug.pool_rank}. ${drug.name}\n${x === 0 ? `Bulk reference: ${fmt(drug.bulk_consensus)}` : `${signatures[x! - 1]!.signature_id}\n${scoreText(drug, signatures[x! - 1]!)}`}`;
    } },
    series: [{ type: 'heatmap', data: points, itemStyle: { borderWidth: 1, borderColor: colors.surface } }],
  };
}
