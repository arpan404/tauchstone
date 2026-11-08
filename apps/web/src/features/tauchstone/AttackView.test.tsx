import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Schema } from '@/api/types';
import { useUi } from '@/store/ui';
import { AttackView } from './AttackView';
import { claimSentence, drugDisplayName, joinSentences } from './attackCopy';

const scope = vi.hoisted(() => ({
  invalidate: vi.fn(),
  project: { id: 'GSE132903', preregistered: true, signature_id: 'GSE132903' } as Record<string, unknown> | null,
  drugName: undefined as string | undefined,
  drug: {} as Record<string, unknown>,
}));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: scope.invalidate }),
}));
vi.mock('@/api/workspace', () => ({
  useCurrentProject: () => scope.project,
  useProjects: () => ({ data: [{ id: 'GSE132903', preregistered: true, signature_id: 'GSE132903' }, scope.project] }),
}));
const mocks = vi.hoisted(() => ({ start: vi.fn(), run: vi.fn(), snapshot: null as unknown }));
vi.mock("@/api/mvpHooks", async (orig) => ({
  ...(await orig<typeof import("@/api/mvpHooks")>()),
  useProjectCandidates: () => ({ data: undefined }),
  useDrug: () => ({ data: scope.drugName || Object.keys(scope.drug).length ? { name: scope.drugName, ...scope.drug } : undefined }),
}));
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
  scope.invalidate.mockReset();
  scope.project = { id: 'GSE132903', preregistered: true, signature_id: 'GSE132903' };
  scope.drugName = undefined;
  scope.drug = {};
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
  fireEvent.click(screen.getByRole('button', { name: 'Browse candidates' }));
  expect(useUi.getState().step).toBe('candidates');
  expect(mocks.start).not.toHaveBeenCalled();
});
const card = (name: RegExp) => screen.getByRole('button', { name }).closest('li') as HTMLElement;
it('creates only on explicit action, with the budget fixed at min(5, hidden tests) and no picker', () => {
  scope.drug = { n_hidden_tests: 3, preregistered: false, attack_ready: false };
  render(<AttackView />);
  expect(mocks.start).not.toHaveBeenCalled();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getByText('3 tests available')).toBeTruthy();
  // A drug outside the sealed set is flagged before anything starts and is never previewed.
  expect(screen.getByText('Exploratory')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
  expect(mocks.start.mock.calls[0][0]).toEqual({ candidateId: 'drug-a', mode: 'attack', budget: 3 });
  expect(mocks.run).not.toHaveBeenCalled();
});
it('lists a sealed drug\'s own tests before the session starts, with every result sealed', () => {
  scope.drug = { n_hidden_tests: 2, preregistered: true, attack_ready: true };
  const revealedLeak = { ...initial, contexts: initial.contexts.map((c) => ({ ...c, outcome: 'fail' })) };
  render(<AttackView />);
  expect(mocks.start).toHaveBeenCalledTimes(1);
  expect(mocks.start.mock.calls[0][0]).toEqual({ candidateId: 'drug-a', mode: 'attack', budget: 2 });
  act(() => mocks.start.mock.calls[0][1].onSuccess(revealedLeak));
  const tests = screen.getAllByText('Result sealed');
  expect(tests).toHaveLength(2);
  expect(screen.getByText('Held-out cohort A')).toBeTruthy();
  expect(screen.queryByText('Failed')).toBeNull();
  expect(screen.queryByText(/Reversal score/)).toBeNull();
  expect(screen.getByText('2 tests available')).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Chance the claim holds 60%' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Run test' })).toBeNull();
  // Starting adopts the listed session instead of opening a second one.
  fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
  expect(mocks.start).toHaveBeenCalledTimes(1);
  expect(useUi.getState().sessionId).toBe('session-a');
  expect(screen.getByRole('button', { name: 'Run test' })).toBeTruthy();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('restores continuity and reveals only the committed server result', () => {
  const view = restore();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(screen.queryByText(/Reversal score/)).toBeNull();
  expect(within(card(/Held-out cohort A/)).getByRole('button', { name: 'Run test' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Held-out cohort B/ }));
  expect(mocks.run).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /Held-out cohort B/ }).getAttribute('aria-pressed')).toBe('true');
  // The run action moves to the chosen test; the suggestion stays marked.
  expect(within(card(/Held-out cohort B/)).getByRole('button', { name: 'Run test' })).toBeTruthy();
  expect(within(card(/Held-out cohort A/)).getByText('Suggested next')).toBeTruthy();
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Run test' }));
    vi.advanceTimersByTime(1000);
  } finally {
    vi.useRealTimers();
  }
  expect(mocks.run.mock.calls[0][0]).toEqual({ contextId: 'ctx-b', mode: 'attack' });
  const revealed: Schema<'RevealedOutcome'> = { context_id: 'ctx-b', type: 'held_out_cohort', label: 'Held-out cohort B', outcome: 'fail', value: 0.123, threshold: 0.05, rule: 'Server reveal rule', belief_before: 0.6, belief_after: 0.2 };
  const result = { ...initial, budget_remaining: 1, history: [revealed], belief: { p_claim_holds: 0.2 }, contexts: initial.contexts.map(c => c.context_id === 'ctx-b' ? { ...c, status: 'revealed', outcome: 'fail' } : c) };
  // Mutation completion is the only source of observed values.
  mocks.run.mock.calls[0][1].onSuccess(result);
  view.rerender(<AttackView />);
  const b = () => within(card(/Held-out cohort B/));
  expect(b().getByText('Failed')).toBeTruthy();
  expect(b().getByText('0.12')).toBeTruthy();
  expect(b().getByText(/Server reveal rule/)).toBeTruthy();
  expect(b().getByText(/60% → 20%/)).toBeTruthy();
  expect(card(/Held-out cohort A/).textContent).toMatch(/Suggested next|Result sealed/);
  expect(card(/Held-out cohort A/).getAttribute('data-outcome')).toBeNull();
  expect(screen.getByRole('button', { name: /Held-out cohort B/ }).hasAttribute('disabled')).toBe(true);
  view.unmount();
  mocks.snapshot = result;
  render(<AttackView />);
  expect(b().getByText(/Server reveal rule/)).toBeTruthy();
  expect(card(/Held-out cohort B/).getAttribute('data-outcome')).toBe('fail');
});
it('never presents another candidate session as the current candidate', () => {
  restore();
  useUi.setState({ selectedCandidateId: 'drug-b' });
  cleanup(); render(<AttackView />);
  expect(screen.getByRole('heading', { name: /Drug B/ })).toBeTruthy();
  expect(screen.getByLabelText('Claim under test').textContent).toBe(claimSentence('Drug B'));
  expect(screen.queryByText(/Drug A/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Run test' })).toBeNull();
});
it('starts a fresh session only when requested and retains history until success', () => {
  restore();
  fireEvent.click(screen.getByRole('button', { name: 'Start new session' }));
  expect(mocks.start.mock.calls[0][0]).toMatchObject({ candidateId: 'drug-a', budget: 2 });
  expect(useUi.getState().sessionId).toBe('session-a');
  expect(screen.getByLabelText('Claim under test').textContent).toBe(
    "Drug A pushes Alzheimer's genes the opposite way in at least 70% of the checks set aside in advance.");
});
it('does not render an outcome attached to a hidden context', () => {
  mocks.snapshot = { ...initial, contexts: initial.contexts.map(c => ({ ...c, outcome: 'fail' })) };
  useUi.setState({ sessionId: 'session-a' });
  render(<AttackView />);
  for (const name of [/Held-out cohort A/, /Held-out cohort B/]) {
    const hidden = card(name);
    expect(hidden.getAttribute('data-outcome')).toBeNull();
    expect(hidden.textContent).not.toContain('Revealed');
    expect(hidden.textContent).not.toMatch(/(?<!(to|this test) )\bfail(ed|s)?\b/i);
  }
  expect(screen.queryByText('Failed')).toBeNull();
  expect(screen.queryByText('Passed')).toBeNull();
  expect(screen.queryByText(/Reversal score/)).toBeNull();
  expect(screen.getByRole('group', { name: '0 of 2 tests run; 2 left' })).toBeTruthy();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('cannot commit after budget is exhausted', () => {
  mocks.snapshot = { ...initial, budget_remaining: 0 };
  useUi.setState({ sessionId: 'session-a' });
  render(<AttackView />);
  expect(screen.queryByRole('button', { name: 'Run test' })).toBeNull();
  for (const name of [/Held-out cohort A/, /Held-out cohort B/]) {
    const pick = screen.getByRole('button', { name });
    expect(pick.hasAttribute('disabled')).toBe(true);
    fireEvent.click(pick);
  }
  expect(screen.getByText('No tests left in budget')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open report' })).toBeTruthy();
  expect(mocks.run).not.toHaveBeenCalled();
});
it('offers no hidden tests under a non-preregistered project and switches to the preregistered one', () => {
  scope.project = { id: 'upload-1', preregistered: false, signature_id: null };
  useUi.setState({ currentProjectId: 'upload-1', selectedCandidateId: 'drug-a' });
  render(<AttackView />);
  expect(screen.getByRole('heading', { name: 'Hidden tests exist only for the preregistered project' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start test session' })).toBeNull();
  expect(screen.queryByText(/Held-out cohort/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open GSE132903' }));
  expect(useUi.getState().currentProjectId).toBe('GSE132903');
  // A drug picked from another project's ranking is not carried into the preregistered one.
  expect(useUi.getState().selectedCandidateId).toBeNull();
  expect(mocks.start).not.toHaveBeenCalled();
});
it('names the drug, never its BRD id, in the header and claim', () => {
  scope.drugName = 'Articaine';
  mocks.snapshot = { ...initial, candidate_id: 'BRD-A70514680', candidate_name: 'BRD-A70514680',
    claim: { ...initial.claim, text: 'BRD-A70514680 reverses the AD signature' } };
  useUi.setState({ selectedCandidateId: 'BRD-A70514680', sessionId: 'session-a' });
  render(<AttackView />);
  expect(screen.getByLabelText('Claim under test').textContent).toBe(claimSentence('Articaine', 0.7));
  expect(screen.getByLabelText('Claim under test').textContent).toContain("Alzheimer's");
  expect(screen.getByRole('region', { name: 'Claim and result' }).textContent).not.toContain('BRD-');
  expect(drugDisplayName('BRD-1', 'BRD-1', undefined, 'Name')).toBe('Name');
  expect(drugDisplayName('BRD-1', null, undefined)).toBe('BRD-1');
});
it('refreshes drug and candidate queries after a session builds tests', () => {
  render(<AttackView />);
  fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
  mocks.start.mock.calls[0][1].onSuccess({ ...initial, preregistered: false });
  expect(scope.invalidate.mock.calls.map((c) => c[0].queryKey[0])).toEqual(
    expect.arrayContaining(['drug', 'project-candidates', 'candidates']));
});
it('asks before replacing a session with reveals and resets the new session to Attack', async () => {
  const revealed: Schema<'RevealedOutcome'> = { context_id: 'ctx-b', type: 'held_out_cohort', label: 'Held-out cohort B', outcome: 'fail', value: 0.1, threshold: 0.05, rule: 'r', belief_before: 0.6, belief_after: 0.2 };
  mocks.snapshot = { ...initial, mode: 'learn', history: [revealed], contexts: initial.contexts.map(c => c.context_id === 'ctx-b' ? { ...c, status: 'revealed', outcome: 'fail' } : c) };
  useUi.setState({ sessionId: 'session-a', mode: 'learn' });
  render(<AttackView />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new session' }));
  expect(mocks.start).not.toHaveBeenCalled();
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep session' }));
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start new session' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start new session' }));
  expect(mocks.start.mock.calls[0][0]).toMatchObject({ candidateId: 'drug-a', mode: 'attack' });
  expect(useUi.getState().mode).toBe('attack');
});
it('explains both modes and joins hint sentences with one full stop', () => {
  restore();
  expect(screen.getByRole('button', { name: 'Likely to fail' }).getAttribute('aria-description')).toBe('Suggest the test most likely to break the claim');
  expect(screen.getByRole('button', { name: 'Informative' }).getAttribute('aria-description')).toBe('Suggest the test expected to move the chance the claim holds the most');
  expect(joinSentences('Most likely to break the claim: 48% chance this test fails.', 'Informative applies after the next result'))
    .toBe('Most likely to break the claim: 48% chance this test fails. Informative applies after the next result');
  fireEvent.click(screen.getByRole('button', { name: 'Informative' }));
  expect(screen.getByText('Informative applies after the next result')).toBeTruthy();
  expect(screen.getByText('Earlier pick')).toBeTruthy();
  expect(document.getElementById('attack-rec-rationale')?.textContent).not.toContain('..');
});
