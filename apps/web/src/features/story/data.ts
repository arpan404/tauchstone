import type { BenchmarkData, Schema } from '@/api/types';

// Only discovery rank and ID enter this choice. Never inspect validation or exposure.
export function discoveryCandidate(candidates: Schema<'Candidate'>[] = []) {
  return [...candidates].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))[0];
}
export function benchmarkHeadline(data?: BenchmarkData) {
  const all = data?.all_candidates;
  const analysis = all?.policies?.length ? all : data;
  const policies = analysis?.policies;
  return {
    n: analysis?.n_candidates,
    budget: analysis?.budget,
    tauchstone: policies?.find((p) => p.policy === 'tauchstone_hybrid')?.decision_accuracy.estimate,
    random: policies?.find((p) => p.policy === 'random')?.decision_accuracy.estimate,
  };
}
export function percent(value?: number) {
  return value === undefined ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
}
