import type { Schema } from '@/api/types';

/** Fibonacci sphere: index only, never biological similarity or held-out evidence. */
export function geneAttributes(genes: Schema<'GeneStat'>[]) {
  const positions = new Float32Array(genes.length * 3);
  const colors = new Float32Array(genes.length * 3);
  const sizes = new Float32Array(genes.length);
  genes.forEach((gene, i) => {
    const y = 1 - 2 * (i + 0.5) / genes.length;
    const radius = Math.sqrt(1 - y * y);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    positions.set([radius * Math.cos(angle) * 2.6, y * 2.6, radius * Math.sin(angle) * 2.6], i * 3);
    const bright = gene.query_set ? 1 : 0.8;
    const color = gene.stat >= 0 ? [1, 0.52, 0.28] : [0.17, 0.83, 0.76];
    colors.set(color.map(c => c * bright), i * 3);
    sizes[i] = (1.8 + Math.min(Math.abs(gene.stat), 12) * 0.32) * (gene.query_set ? 1.35 : 1);
  });
  return { positions, colors, sizes };
}

/** Deterministic visual load test; never used for any scientific computation. */
export function syntheticGenes(): Schema<'GeneStat'>[] {
  return Array.from({ length: 16000 }, (_, i) => ({
    entrez_id: `synthetic-${i}`, symbol: `synthetic-${i}`, stat: Math.sin(i * 1.7) * 8,
    log2fc: 0, p_value: 1, fdr: 1, query_set: i < 300 ? (i % 2 ? 'up' : 'down') : null,
  }));
}

/** Orthographic framing reserves space for the orbital labels at every aspect ratio. */
export function sceneFrame(width: number, height: number) {
  const w = Math.max(width, 1), h = Math.max(height, 1);
  const diameter = Math.min(h * 0.6, w * 0.42);
  const worldPerPixel = 5.2 / diameter;
  return { halfWidth: w * worldPerPixel / 2, halfHeight: h * worldPerPixel / 2 };
}
