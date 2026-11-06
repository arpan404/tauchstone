import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenchmarkData } from '@/api/types';

const interval = { estimate: .88, ci95: [.81, .94] };
const benchmark: BenchmarkData = {
  n_candidates: 32, n_seeds: 8, budget: 5,
  preregistration_sha256: 'test-preregistration',
  provenance: { dataset_accession: 'MOCK' } as BenchmarkData['provenance'],
  policies: [{
    policy: 'random', label: 'random',
    decision_accuracy: interval, fragile_recall_at_3: interval, fragile_recall_at_5: interval,
    experiments_to_correct_verdict: { median: 3, iqr: [2, 4], ci95: [2, 4] },
  }],
  calibration: [],
  tests: [{
    policy_a: 'tauchstone_hybrid', policy_b: 'random',
    metric: 'experiments_to_correct_verdict', p_holm: .0009,
  }],
};
vi.mock('@/api/hooks', () => ({
  useBenchmark: () => ({ data: benchmark, isLoading: false, isError: false }),
  useMockStatus: () => true,
}));
vi.mock('@/components/InstrumentChart', () => ({ InstrumentChart: () => <div /> }));
vi.mock('@/components/ProvenanceStrip', () => ({ ProvenanceStrip: () => null }));
import { BenchmarkView } from './BenchmarkView';

afterEach(cleanup);
describe('benchmark presentation', () => {
  it('leads with API accuracy and intervals before the tied median chart', () => {
    render(<BenchmarkView />);
    const accuracy = screen.getByRole('region', { name: 'Decision accuracy after five tests' });
    expect(accuracy.textContent).toContain('88%');
    expect(accuracy.textContent).toContain('81.0%, 94.0%');
    expect(accuracy.textContent).toContain('Holm p = 0.000900');
    expect(accuracy.textContent).toContain('experiments to correct verdict');
    const median = screen.getByText('Experiments to correct verdict (median, 95% CI)');
    expect(accuracy.compareDocumentPosition(median) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
