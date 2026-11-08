import { render, screen, cleanup, within } from '@testing-library/react';
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
    { policy_a: 'decision_lookahead_hybrid', policy_b: 'random', metric: 'decision_accuracy', p_holm: 0.246 },
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
  it('computes the headline from /benchmark and plots every policy', () => {
    render(<BenchmarkView />);
    const hero = screen.getByRole('region', { name: 'Headline result' });
    expect(hero.textContent).toContain('Correct verdict within 5 tests');
    expect(hero.textContent).toContain('100%');
    expect(hero.textContent).toMatch(/88%\s*Random/);
    expect(hero.textContent).toContain('Holm p · decision accuracy');
    expect(hero.textContent).toMatch(/Tauchstone vs random\s*0\.000900/);
    expect(hero.textContent).toMatch(/Tauchstone vs confirmation\s*0\.00200/);
    expect(hero.textContent).toContain('Permutation gate');
    expect(hero.textContent).toContain('17/20 not met');
    expect(hero.textContent).toContain('21f7460e');
    // The decision-aware co-primary result stays visible: 87%, not better than random.
    expect(hero.textContent).toMatch(/87%\s*Decision-aware/);
    expect(hero.textContent).toMatch(/Decision-aware vs random\s*not better\s*0\.246/);
    const plot = screen.getByRole('region', { name: 'Decision accuracy after five tests' });
    for (const p of ['Tauchstone decision accuracy 100%', 'Random decision accuracy 88%',
      'Decision-aware decision accuracy 87%', 'Confirmation decision accuracy 80%'])
      expect(within(plot).getByRole('listitem', { name: p })).toBeTruthy();
  });
});
