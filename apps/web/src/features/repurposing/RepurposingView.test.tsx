import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { useUi } from '@/store/ui';
vi.mock('@/api/hooks', () => ({
  useCandidates: () => ({ data: { candidates: [
    { id: 'BRD-1', name: 'Alpha', rank: 1, consensus: -1, consensus_iqr: [-2, 0], scores: { wtcs: -1, ks: -1, cosine: -1 }, n_ranking_contexts: 2 },
    { id: 'BRD-2', name: 'Beta', rank: 2, consensus: 1, consensus_iqr: [0, 2], scores: { wtcs: 1, ks: 1, cosine: 1 }, n_ranking_contexts: 4 },
  ], n_ranked: 2, signature: 'test' } }),
  useMockStatus: () => false,
}));
vi.mock('@/components/ProvenanceStrip', () => ({ ProvenanceStrip: () => null }));
import { RepurposingView } from './RepurposingView';
afterEach(() => { cleanup(); useUi.setState({ selectedCandidateId: null, step: 'candidates' }); });
it('searches IDs, clears filters, and keeps selection on page until an explicit action', () => {
  useUi.setState({ step: 'candidates' });
  render(<RepurposingView />);
  fireEvent.change(screen.getByLabelText('Search name or ID'), { target: { value: 'brd-2' } });
  expect(screen.queryByRole('button', { name: /Select Alpha/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Select Beta/ }));
  expect(useUi.getState().step).toBe('candidates');
  fireEvent.click(screen.getByText('Add to comparison'));
  expect(screen.getByText('Discovery comparison (1/3)')).toBeTruthy();
  fireEvent.click(screen.getByText('Clear controls'));
  expect(screen.getByRole('button', { name: /Select Alpha/ })).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Negative consensus only'));
  expect(screen.queryByRole('button', { name: /Select Beta/ })).toBeNull();
  fireEvent.click(screen.getByText('Experiments'));
  expect(useUi.getState().step).toBe('attack');
});
