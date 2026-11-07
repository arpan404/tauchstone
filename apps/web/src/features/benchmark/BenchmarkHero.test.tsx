import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenchmarkData } from '@/api/types';

const interval = { estimate: 0.88, ci95: [0.81, 0.94] };
const full: BenchmarkData = {
  n_candidates: 46, n_seeds: 20, budget: 5,
  preregistration_sha256: '21f7460e9c1a2b3c4d5e6f708192a3b4c5d6e7f80',
  provenance: { dataset_accession: 'MOCK' } as BenchmarkData['provenance'],
  policies: ([
    ['tauchstone_hybrid', 1.0], ['max_failure', 1.0], ['max_uncertainty', 1.0],
    ['expected_decision_change', 0.98], ['random', 0.88],
    ['decision_lookahead_hybrid', 0.87], ['greedy_strongest', 0.8],
  ] as const).map(([policy, estimate]) => ({
    policy, label: policy,
    decision_accuracy: { estimate, ci95: [0.8, 0.95] as [number, number] },
    fragile_recall_at_3: interval, fragile_recall_at_5: interval,
    experiments_to_correct_verdict: { median: 3, iqr: [2, 4] as [number, number], ci95: [2, 4] as [number, number] },
  })),
  calibration: [],
  tests: [
    { policy_a: 'tauchstone_hybrid', policy_b: 'random', metric: 'decision_accuracy', p_holm: 0.0009 },
    { policy_a: 'tauchstone_hybrid', policy_b: 'greedy_strongest', metric: 'decision_accuracy', p_holm: 0.002 },
  ],
  all_candidates: { n_candidates: 50, n_seeds: 20, budget: 5, policies: [], calibration: [], tests: [] },
};
vi.mock('@/api/hooks', () => ({
  useBenchmark: () => ({ data: full, isLoading: false, isError: false }),
  useMockStatus: () => true,
}));
vi.mock('@/components/InstrumentChart', () => ({ InstrumentChart: () => <div /> }));
vi.mock('@/components/ProvenanceStrip', () => ({ ProvenanceStrip: () => null }));
import { BenchmarkView } from './BenchmarkView';

afterEach(cleanup);
describe('benchmark hero', () => {
  it('computes the headline from /benchmark and bars every policy', () => {
    render(<BenchmarkView />);
    const hero = screen.getByRole('region', { name: 'Headline result' });
    expect(hero.textContent).toContain('within 5 tests · 50 sealed drugs');
    expect(hero.textContent).toContain('100%');
    expect(hero.textContent).toContain('88% random');
    expect(hero.textContent).toContain('vs random p = 0.000900');
    expect(hero.textContent).toContain('vs confirmation p = 0.00200');
    expect(hero.textContent).toContain('permutation 17/20');
    expect(hero.textContent).toContain('prereg 21f7460e');
    const bars = screen.getByRole('region', { name: 'Decision accuracy by policy' });
    expect(bars.textContent).toContain('100%');
    expect(bars.textContent).toContain('80%');
  });
});
