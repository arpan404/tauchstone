import { describe, expect, it } from 'vitest';
import { geneAttributes, syntheticGenes } from './geometry';
describe('gene sphere', () => {
  it('keeps 16k genes in one finite attribute array on a fixed radius', () => {
    const genes = syntheticGenes();
    const { positions, colors, sizes } = geneAttributes(genes);
    expect(positions.length).toBe(48000);
    for (let i = 0; i < genes.length; i++) {
      expect(Math.hypot(...positions.slice(i * 3, i * 3 + 3))).toBeCloseTo(2.6, 5);
      expect(Number.isFinite(sizes[i])).toBe(true);
    }
    expect(colors[0]).toBeGreaterThan(colors[2]);
    expect(geneAttributes([{ ...genes[0], stat: -4 }]).colors[1]).toBeGreaterThan(geneAttributes([{ ...genes[0], stat: -4 }]).colors[0]);
  });
  it('handles an empty signature', () => expect(geneAttributes([]).positions.length).toBe(0));
});
