import { describe, expect, it } from 'vitest';
import { geneAttributes, syntheticGenes, sceneFrame } from './geometry';
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

describe('expo framing', () => {
  it.each([[1280, 360], [1920, 640], [360, 450]])('keeps the sphere inside the label orbit at %ix%i', (width, height) => {
    const fit = sceneFrame(width, height);
    const pixelRadius = 2.6 / fit.halfHeight * height / 2;
    expect(pixelRadius).toBeLessThanOrEqual(height * .3 + .001);
    expect(pixelRadius).toBeLessThanOrEqual(width * .21 + .001);
    // Top and bottom labels have 41% orbit radius; reserve 35px half-height.
    expect(height * .41 - pixelRadius).toBeGreaterThan(35);
  });
  it('keeps low-stat genes visible and query genes brighter', () => {
    const gene = { ...syntheticGenes()[0], stat: 0.1, query_set: null };
    const plain = geneAttributes([gene]);
    const query = geneAttributes([{ ...gene, query_set: 'up' }]);
    expect(plain.sizes[0]).toBeGreaterThan(1.8);
    expect(plain.colors[0]).toBeCloseTo(.8);
    expect(query.colors[0]).toBeGreaterThan(plain.colors[0]);
    expect(query.sizes[0]).toBeGreaterThan(plain.sizes[0]);
  });
});
