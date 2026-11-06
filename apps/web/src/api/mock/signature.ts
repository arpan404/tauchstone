import type { components } from '../schema';
import { MOCK_SEED, randn, roundTo, streamFor } from './prng';

type Signature = components['schemas']['Signature'];
type GeneStat = components['schemas']['GeneStat'];

const N_GENES = 2000;

/** Fixed sign-check genes: symbol, expected direction, entrez id. */
const SIGN_CHECK_GENES: { symbol: string; expected: 'up' | 'down'; entrez: string }[] = [
  { symbol: 'GFAP', expected: 'up', entrez: '2670' },
  { symbol: 'CD44', expected: 'up', entrez: '960' },
  { symbol: 'SERPINA3', expected: 'up', entrez: '12' },
  { symbol: 'SST', expected: 'down', entrez: '6750' },
  { symbol: 'VGF', expected: 'down', entrez: '7425' },
  { symbol: 'NPTX2', expected: 'down', entrez: '4885' },
  { symbol: 'BDNF', expected: 'down', entrez: '627' },
];

let cache: Signature | null = null;

function pFromStat(stat: number, rng: () => number): number {
  // Two-sided-ish p decaying with |stat|, plus noise; clamped to (0, 1).
  const base = 2 * (1 - normalCdf(Math.abs(stat)));
  const jitter = 0.3 + rng() * 1.4;
  return Math.min(1, Math.max(1e-12, base * jitter));
}

function normalCdf(x: number): number {
  // Abramowitz-Stegun approximation.
  const t = 1 / (1 + 0.2316419 * x);
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}

function bhFdr(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((_, i) => i).sort((a, b) => pValues[a] - pValues[b]);
  const fdr = new Array<number>(m).fill(1);
  let minSoFar = 1;
  for (let rank = m; rank >= 1; rank--) {
    const i = order[rank - 1];
    const v = Math.min(1, (pValues[i] * m) / rank);
    minSoFar = Math.min(minSoFar, v);
    fdr[i] = minSoFar;
  }
  return fdr;
}

export function getMockSignature(): Signature {
  if (cache) return cache;
  const rng = streamFor('signature:GSE132903');
  const genes: GeneStat[] = [];

  // Background genes.
  for (let i = 0; i < N_GENES - SIGN_CHECK_GENES.length; i++) {
    const stat = randn(rng) * 1.6 + (rng() < 0.06 ? (rng() < 0.55 ? 3.4 : -3.4) : 0);
    const log2fc = roundTo(stat * 0.32 + randn(rng) * 0.08, 4);
    genes.push({
      entrez_id: String(100001 + i),
      symbol: `MOCKG${String(i + 1).padStart(4, '0')}`,
      log2fc,
      stat: roundTo(stat, 4),
      p_value: 1, // filled in below
      fdr: 1, // filled in below
      query_set: null,
    });
  }
  // Sign-check genes with strong, correct directions.
  for (const g of SIGN_CHECK_GENES) {
    const dir = g.expected === 'up' ? 1 : -1;
    const stat = dir * (4.2 + rng() * 3.2);
    genes.push({
      entrez_id: g.entrez,
      symbol: g.symbol,
      log2fc: roundTo(dir * (0.9 + rng() * 1.1), 4),
      stat: roundTo(stat, 4),
      p_value: 1,
      fdr: 1,
      query_set: null,
    });
  }

  const pValues = genes.map((g) => pFromStat(g.stat, rng));
  const fdrs = bhFdr(pValues);
  genes.forEach((g, i) => {
    g.p_value = pValues[i];
    g.fdr = fdrs[i];
  });

  // Query sets: top 150 up / 150 down among fdr<0.05 (falls back gracefully).
  const sigUp = genes
    .filter((g) => g.fdr < 0.05 && g.stat > 0)
    .sort((a, b) => b.stat - a.stat || a.p_value - b.p_value);
  const sigDown = genes
    .filter((g) => g.fdr < 0.05 && g.stat < 0)
    .sort((a, b) => a.stat - b.stat || a.p_value - b.p_value);
  for (const g of sigUp.slice(0, 150)) g.query_set = 'up';
  for (const g of sigDown.slice(0, 150)) g.query_set = 'down';

  const nFdr05 = genes.filter((g) => g.fdr < 0.05).length;
  const signCheck = SIGN_CHECK_GENES.map((g) => {
    const found = genes.find((x) => x.symbol === g.symbol);
    const stat = found ? found.stat : 0;
    return {
      symbol: g.symbol,
      expected: g.expected,
      stat,
      matches: g.expected === 'up' ? stat > 0 : stat < 0,
    };
  });

  cache = {
    cohort: 'GSE132903',
    variant: 'main',
    method: 'limma',
    tissue: 'middle temporal gyrus',
    platform: 'Illumina HT-12 v4 (mock)',
    n_ad: 97,
    n_control: 98,
    n_fdr05: nFdr05,
    genes,
    sign_check: signCheck,
    provenance: {
      dataset_accession: 'GSE132903',
      processing_version: 'mock-0.1.0',
      git_commit: 'mock',
      timestamp: '2026-11-05T00:00:00Z',
      random_seed: MOCK_SEED,
      model: 'limma eBayes(robust=TRUE) — mock simulator',
    },
  };
  return cache;
}

/** For tests: clear the cached signature. */
export function resetMockSignature(): void {
  cache = null;
}
