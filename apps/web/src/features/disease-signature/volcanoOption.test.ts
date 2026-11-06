import { describe, expect, it } from 'vitest';
import { buildVolcanoOption, classOf, toVolcanoPoints } from './volcanoOption';
import type { Schema } from '@/api/schema';

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

  it('produces one series per group plus the FDR line', () => {
    const genes = [
      gene({ symbol: 'A', fdr: 0.5 }),
      gene({ symbol: 'B', fdr: 0.01, log2fc: 1, stat: 3 }),
      gene({ symbol: 'C', fdr: 0.001, log2fc: -1.5, stat: -4, query_set: 'down' }),
    ];
    const opt = buildVolcanoOption(genes, false) as { series: unknown[] };
    expect(opt.series).toHaveLength(6);
  });

  it('maps y to -log10(p) without infinities', () => {
    const pts = toVolcanoPoints([gene({ log2fc: 1, p_value: 0.001, fdr: 0.01, symbol: 'X' })]);
    expect(pts[0].y).toBeCloseTo(3, 5);
  });
});
