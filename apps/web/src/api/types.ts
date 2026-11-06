import type { components } from './schema';

/** Shorthand for a contract schema by name. Types come from generated schema.d.ts. */
export type Schema<K extends keyof components['schemas']> = components['schemas'][K];

/** One policy-analysis block: shared by the primary (contested) view and all_candidates. */
export interface BenchmarkAnalysis {
  n_candidates: number;
  n_seeds: number;
  budget: number;
  policies: Schema<'PolicyResult'>[];
  calibration: Schema<'Benchmark'>['calibration'];
  tests: Schema<'Benchmark'>['tests'];
}

/**
 * Benchmark response with the contested-candidate primary analysis.
 * `all_candidates` is tolerated but optional: the engine may not send it yet.
 */
export type BenchmarkData = Schema<'Benchmark'> &
  Partial<Pick<BenchmarkAnalysis, 'n_candidates' | 'n_seeds' | 'budget'>> & {
    contested_share?: number;
    all_candidates?: Partial<BenchmarkAnalysis>;
  };

/** Provenance values that indicate mock/synthetic data (integrity ribbon). */
export function isMockProvenance(provenance?: { dataset_accession?: string | string[] } | null): boolean {
  if (!provenance) return false;
  const values = Array.isArray(provenance.dataset_accession)
    ? provenance.dataset_accession
    : [provenance.dataset_accession ?? ''];
  return values.some((v) => {
    const upper = String(v).toUpperCase();
    return upper === 'MOCK' || upper.includes('MOCK') || upper.includes('SYN');
  });
}
