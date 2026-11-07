import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Schema } from '@/api/types';
import { useUi } from '@/store/ui';
import { AttackView } from './AttackView';

const mocks = vi.hoisted(() => ({ start: vi.fn(), run: vi.fn(), snapshot: null as unknown }));
vi.mock('@/api/hooks', () => ({
  useMockStatus: () => false,
  useCandidates: () => ({ data: { candidates: [{ id: 'drug-a', name: 'Drug A' }] } }),
  useAttackSessionSnapshot: () => mocks.snapshot,
  useStartAttack: () => ({ mutate: mocks.start, isPending: false, isError: false }),
  useRunExperiment: () => ({ mutate: mocks.run, isPending: false, isError: false }),
}));
vi.mock('@/components/InstrumentChart', () => ({ InstrumentChart: () => <div /> }));

const base: Schema<'AttackSession'> = {
  session_id: 'session-a', candidate_id: 'drug-a', candidate_name: 'Drug A', mode: 'attack',
  budget: 2, budget_remaining: 2, preregistered: true,
  claim: { text: 'Drug A reverses the signature', q: 0.7, theta: -1, n_contexts: 2 },
  belief: { p_claim_holds: 0.6 }, verdict: 'SUPPORTED_SO_FAR',
  contexts: [
    { context_id: 'ctx-a', type: 'held_out_cohort', label: 'Held-out cohort A', status: 'hidden', p_survive: 0.3 },
    { context_id: 'ctx-b', type: 'held_out_cohort', label: 'Held-out cohort B', status: 'hidden', p_survive: 0.7 },
  ], recommended_context_id: 'ctx-a', rationale: 'Lowest predicted survival.', history: [],
};

beforeEach(() => {
  mocks.start.mockReset(); mocks.run.mockReset(); mocks.snapshot = null;
  useUi.setState({ selectedCandidateId: 'drug-a', sessionId: 'session-a', mode: 'attack', step: 'attack' });
});
afterEach(cleanup);

it('shows the verdict pill and seals the event log on start', () => {
  mocks.snapshot = base;
  render(<AttackView />);
  expect(screen.getByRole('status', { name: 'Verdict: Supported' }).textContent).toBe('Supported');
  expect(screen.getByText(/session start · 2 hidden tests sealed/)).toBeTruthy();
  expect(screen.queryByText(/not preregistered/)).toBeNull();
});

it('flags a session built on the fly as not preregistered', () => {
  mocks.snapshot = { ...base, preregistered: false };
  render(<AttackView />);
  expect(screen.getByText('not preregistered')).toBeTruthy();
});

it('runs the next test through a running state before the reveal', () => {
  vi.useFakeTimers();
  try {
    mocks.snapshot = base;
    render(<AttackView />);
    fireEvent.click(screen.getByRole('button', { name: 'Run next test' }));
    expect(screen.getByRole('button', { name: 'Running…' })).toBeTruthy();
    expect(mocks.run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(mocks.run.mock.calls[0][0]).toEqual({ contextId: 'ctx-a', mode: 'attack' });
  } finally {
    vi.useRealTimers();
  }
});

it('logs each reveal with consensus, outcome and belief move', () => {
  const revealed: Schema<'RevealedOutcome'> = {
    context_id: 'ctx-a', type: 'held_out_cohort', label: 'Held-out cohort A',
    outcome: 'fail', value: 0.17, threshold: 0.05, rule: 'Server reveal rule',
    belief_before: 0.6, belief_after: 0.2,
  };
  mocks.snapshot = {
    ...base, budget_remaining: 1, belief: { p_claim_holds: 0.2 }, verdict: 'FRAGILE_CONTEXT_DEPENDENT',
    contexts: base.contexts.map((c) => c.context_id === 'ctx-a' ? { ...c, status: 'revealed', outcome: 'fail' } : c),
    history: [revealed],
  };
  render(<AttackView />);
  expect(screen.getByRole('status', { name: 'Verdict: Fragile' })).toBeTruthy();
  expect(screen.getByText(/Held-out cohort A · consensus 0.17 · fail/)).toBeTruthy();
  expect(screen.getByText(/P\(claim\) 0.60 → 0.20/)).toBeTruthy();
});
