import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STEPS, useUi } from './store/ui';
vi.mock('@/api/hooks', () => ({
  useMockStatus: () => true,
  useCandidates: () => ({ data: { candidates: [{ id: 'compound-a', name: 'Compound A' }] } }),
}));
vi.mock('@/features/repurposing/RepurposingView', () => ({ RepurposingView: () => <div>Candidate explorer</div> }));
vi.mock('@/features/disease-signature/DiseaseSignatureView', () => ({ DiseaseSignatureView: () => <div>Signature view</div> }));
vi.mock('@/features/evidence/EvidenceView', () => ({ EvidenceView: () => <div>Evidence view</div> }));
vi.mock('@/features/tauchstone/AttackView', () => ({ AttackView: () => <div>Experiment view</div> }));
vi.mock('@/features/benchmark/BenchmarkView', () => ({ BenchmarkView: () => <div>Benchmark view</div> }));
vi.mock('@/features/about', () => ({ About: () => <div>Methods view</div> }));
vi.mock('@/features/single-cell', () => ({ SingleCellPanel: () => <div>Cell view</div> }));

beforeEach(() => useUi.setState({ step: 'candidates', selectedCandidateId: null, sessionId: null, mode: 'attack' }));
afterEach(cleanup);
describe('research workspace shell', () => {
  it('opens Candidates immediately with unnumbered navigation and no tour or expo entry', () => {
    render(<App />);
    expect(screen.getByRole('main', { name: 'Candidates' }).textContent).toContain('Candidate explorer');
    const nav = within(screen.getByRole('navigation', { name: 'Research workspace' }));
    expect(nav.getAllByRole('button').map((b) => b.firstChild?.textContent)).toEqual([
      'Candidates', 'Disease signature', 'Evidence', 'Experiments', 'Benchmark', 'Cell types', 'Methods',
    ]);
    expect(STEPS[0].id).toBe('candidates');
    expect(screen.queryByRole('button', { name: /tour|^expo\b/i })).toBeNull();
    fireEvent.keyDown(window, { key: 'e' });
    fireEvent.keyDown(window, { key: '1' });
    expect(useUi.getState().step).toBe('candidates');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps candidate identity through evidence, experiments, and extra pages', () => {
    useUi.getState().selectCandidate('compound-a');
    render(<App />);
    const context = within(screen.getByRole('region', { name: 'Selected candidate' }));
    expect(context.getByText('Compound A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Methods/ }));
    expect(screen.getByRole('main', { name: 'Methods' })).toBeTruthy();
    fireEvent.click(context.getByRole('button', { name: 'View evidence' }));
    expect(screen.getByRole('main', { name: 'Evidence' }).textContent).toContain('Evidence view');
    fireEvent.click(context.getByRole('button', { name: 'Open experiments' }));
    expect(screen.getByRole('main', { name: 'Experiments' }).textContent).toContain('Experiment view');
    expect(useUi.getState().selectedCandidateId).toBe('compound-a');
  });
  it('offers candidate selection without choosing from held-out evidence', () => {
    render(<App />);
    expect(screen.getByText('No candidate selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open experiments' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a candidate' }));
    expect(useUi.getState().selectedCandidateId).toBeNull();
    expect(useUi.getState().step).toBe('candidates');
  });
});
