import { describe, expect, it } from 'vitest';
import { buildVolcanoOption, classOf, toVolcanoPoints } from './volcanoOption';
import type { Schema } from '@/api/types';

type GeneStat = Schema<'GeneStat'>;

function gene(over: Partial<GeneStat>): GeneStat {
  return {
    entrez_id: '1',
    symbol: 'G',
    log2fc: 0,
    stat: 0,
    p_value: 0.5,
    fdr: 0.5,
    query_set: null,
    ...over,
  };
}

describe('volcano option builder', () => {
  it('classifies query genes, directional genes, and non-significant ones', () => {
    expect(classOf(gene({ fdr: 0.5 }))).toBe('ns');
    expect(classOf(gene({ fdr: 0.01, log2fc: 1.2 }))).toBe('up');
    expect(classOf(gene({ fdr: 0.01, log2fc: -0.8 }))).toBe('down');
    expect(classOf(gene({ fdr: 0.001, log2fc: 2, query_set: 'up' }))).toBe('query_up');
    expect(classOf(gene({ fdr: 0.001, log2fc: -2, query_set: 'down' }))).toBe('query_down');
  });

  it('produces one series per group, the FDR line and the searched-gene layer', () => {
    const genes = [
      gene({ symbol: 'A', fdr: 0.5 }),
      gene({ symbol: 'B', fdr: 0.01, log2fc: 1, stat: 3 }),
      gene({ symbol: 'C', fdr: 0.001, log2fc: -1.5, stat: -4, query_set: 'down' }),
    ];
    const opt = buildVolcanoOption(genes, false) as { series: unknown[] };
    expect(opt.series).toHaveLength(7);
  });

  it('draws the FDR 0.05 line at the largest p that passes, not at p = 0.05', () => {
    const genes = [
      gene({ symbol: 'A', p_value: 0.001, fdr: 0.02 }),
      gene({ symbol: 'B', p_value: 0.01, fdr: 0.049 }),
      gene({ symbol: 'C', p_value: 0.03, fdr: 0.2 }),
    ];
    const opt = buildVolcanoOption(genes, false) as { series: { name: string; markLine?: { data: { yAxis: number }[] } }[] };
    const line = opt.series.find((s) => s.name === 'FDR 0.05');
    expect(line?.markLine?.data[0]?.yAxis).toBeCloseTo(2, 5);
  });

  it('labels searched genes on their own layer', () => {
    const g = gene({ symbol: 'GFAP', entrez_id: '2670', log2fc: 1, p_value: 1e-6, fdr: 1e-4 });
    const opt = buildVolcanoOption([g], false, [g], '2670') as { series: { name: string; data: { label?: { formatter: string } }[] }[] };
    const layer = opt.series.find((s) => s.name === 'Searched genes');
    expect(layer?.data[0]?.label?.formatter).toBe('GFAP');
  });

  it('maps y to -log10(p) without infinities', () => {
    const pts = toVolcanoPoints([gene({ log2fc: 1, p_value: 0.001, fdr: 0.01, symbol: 'X' })]);
    expect(pts[0].y).toBeCloseTo(3, 5);
  });
});
