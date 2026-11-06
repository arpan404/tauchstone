import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Schema } from '@/api/types';
import { useUi } from '@/store/ui';
import { AttackView } from './AttackView';

const mocks = vi.hoisted(() => ({ start: vi.fn(), run: vi.fn(), snapshot: null as unknown }));
vi.mock('@/api/hooks', () => ({
  useMockStatus: () => false,
  useCandidates: () => ({ data: { candidates: [{ id: 'drug-a', name: 'Drug A' }, { id: 'drug-b', name: 'Drug B' }] } }),
  useAttackSessionSnapshot: () => mocks.snapshot,
  useStartAttack: () => ({ mutate: mocks.start, isPending: false, isError: false }),
  useRunExperiment: () => ({ mutate: mocks.run, isPending: false, isError: false }),
}));
vi.mock('@/components/InstrumentChart', () => ({ InstrumentChart: () => <div /> }));
const initial: Schema<'AttackSession'> = {
  session_id: 'session-a', candidate_id: 'drug-a', candidate_name: 'Drug A', mode: 'attack',
  budget: 2, budget_remaining: 2,
  claim: { text: 'Drug A reverses the signature', q: 0.7, theta: -1, n_contexts: 2 },
  belief: { p_claim_holds: 0.6 }, verdict: 'SUPPORTED_SO_FAR',
  contexts: [
    { context_id: 'ctx-a', label: 'Held-out cohort A', type: 'held_out_cohort', status: 'hidden', p_survive: 0.3 },
    { context_id: 'ctx-b', label: 'Held-out cohort B', type: 'held_out_cohort', status: 'hidden', p_survive: 0.7 },
  ], recommended_context_id: 'ctx-a', rationale: 'Lowest predicted survival.', history: [],
};
beforeEach(() => {
  mocks.start.mockReset(); mocks.run.mockReset(); mocks.snapshot = null;
  useUi.setState({ selectedCandidateId: 'drug-a', sessionId: null, mode: 'attack', step: 'attack' });
});
afterEach(cleanup);
function restore() {
  mocks.snapshot = initial;
  useUi.setState({ sessionId: 'session-a' });
  return render(<AttackView />);
}
it('links the empty workspace to candidate selection without starting a session', () => {
  useUi.setState({ selectedCandidateId: null });
  render(<AttackView />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose candidate' }));
  expect(useUi.getState().step).toBe('candidates');
  expect(mocks.start).not.toHaveBeenCalled();
});
it('creates only on explicit action with the chosen budget', () => {
  render(<AttackView />);
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Session budget'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create experiment session' }));
  expect(mocks.start.mock.calls[0][0]).toEqual({ candidateId: 'drug-a', mode: 'attack', budget: 2 });
  expect(mocks.run).not.toHaveBeenCalled();
});
it('restores continuity and reveals only the committed server result', () => {
  const view = restore();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(screen.queryByText(/Observed/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Held-out cohort B/ }));
  expect(mocks.run).not.toHaveBeenCalled();
  expect(screen.getByText(/Next experiment:/).textContent).toContain('Held-out cohort B');
  fireEvent.click(screen.getByRole('button', { name: 'Commit & run experiment' }));
  expect(mocks.run.mock.calls[0][0]).toEqual({ contextId: 'ctx-b', mode: 'attack' });
  const revealed: Schema<'RevealedOutcome'> = { context_id: 'ctx-b', type: 'held_out_cohort', label: 'Held-out cohort B', outcome: 'fail', value: 0.123, threshold: 0.05, rule: 'Server reveal rule', belief_before: 0.6, belief_after: 0.2 };
  const result = { ...initial, budget_remaining: 1, history: [revealed], belief: { p_claim_holds: 0.2 }, contexts: initial.contexts.map(c => c.context_id === 'ctx-b' ? { ...c, status: 'revealed', outcome: 'fail' } : c) };
  // Mutation completion is the only source of observed values.
  mocks.run.mock.calls[0][1].onSuccess(result);
  view.rerender(<AttackView />);
  expect(screen.getByText('Failed · Held-out cohort B')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Held-out cohort A/ }).textContent).toContain('Hidden');
  expect(screen.getByRole('button', { name: /Held-out cohort B/ }).hasAttribute('disabled')).toBe(true);
  view.unmount();
  mocks.snapshot = result;
  render(<AttackView />);
  expect(screen.getByText('Failed · Held-out cohort B')).toBeTruthy();
});
it('never presents another candidate session as the current candidate', () => {
  restore();
  useUi.setState({ selectedCandidateId: 'drug-b' });
  cleanup(); render(<AttackView />);
  expect(screen.getByRole('heading', { name: 'Drug B' })).toBeTruthy();
  expect(screen.queryByText(/Drug A reverses/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Commit & run experiment' })).toBeNull();
});
it('starts a fresh session only when requested and retains history until success', () => {
  restore();
  fireEvent.click(screen.getByRole('button', { name: 'Start new session' }));
  expect(mocks.start.mock.calls[0][0].candidateId).toBe('drug-a');
  expect(useUi.getState().sessionId).toBe('session-a');
  expect(screen.getByText(/Claim under test:/)).toBeTruthy();
});
it('does not render an outcome attached to a hidden context', () => {
  mocks.snapshot = { ...initial, contexts: initial.contexts.map(c => ({ ...c, outcome: 'fail' })) };
  useUi.setState({ sessionId: 'session-a' });
  render(<AttackView />);
  const hidden = screen.getByRole('button', { name: /Held-out cohort A/ });
  expect(hidden.getAttribute('data-outcome')).toBeNull();
  expect(hidden.textContent).not.toContain('fail');
  expect(screen.queryByText(/Failed ·/)).toBeNull();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('cannot commit after budget is exhausted', () => {
  mocks.snapshot = { ...initial, budget_remaining: 0 };
  useUi.setState({ sessionId: 'session-a' });
  render(<AttackView />);
  const commit = screen.getByRole('button', { name: 'Commit & run experiment' });
  expect(commit.hasAttribute('disabled')).toBe(true);
  fireEvent.click(commit);
  expect(mocks.run).not.toHaveBeenCalled();
});
