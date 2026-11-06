import { describe, expect, it } from 'vitest';
import { buildHeatmapOption, iqrBar } from './heatmapOption';
import type { Schema } from '@/api/types';

describe('heatmap helpers', () => {
  it('iqrBar stays inside 0..100 and has positive width', () => {
    const b = iqrBar(-2.4, -1.8, -3.5, 0);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.left + b.width).toBeLessThanOrEqual(100);
    expect(b.width).toBeGreaterThan(0);
  });

  it('builds one heatmap cell per candidate x cell line', () => {
    const c = (rank: number): Schema<'Candidate'> => ({
      id: `MOCK-${rank}`,
      rank,
      name: `Mock compound ${rank}`,
      consensus: -1.5,
      consensus_iqr: [-1.7, -1.3],
      n_ranking_contexts: 5,
      scores: { wtcs: -1, ks: -1, cosine: -1 },
      by_cell_line: [
        { cell_id: 'A375', consensus: -1.2, n_contexts: 4 },
        { cell_id: 'MCF7', consensus: -1.8, n_contexts: 6 },
      ],
    });
    const opt = buildHeatmapOption([c(1), c(2)], ['A375', 'MCF7']) as {
      series: { data: unknown[] }[];
    };
    expect(opt.series[0].data).toHaveLength(4);
  });
});
