import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { getMockEvidence } from '@/api/mock/evidence';
import { getMockCandidates } from '@/api/mock/candidates';
const evidence = getMockEvidence(getMockCandidates().candidates[0]!.id);
vi.mock('@/api/hooks', () => ({ useEvidence: () => ({ data: evidence }), useMockStatus: () => true }));
vi.mock('@/store/ui', () => ({ useUi: () => ({ selectedCandidateId: 'test', setStep: vi.fn() }) }));
vi.mock('../protein-viewer/ProteinPanel', () => ({ ProteinPanel: () => <div>Structure context</div> }));
import { EvidenceView } from './EvidenceView';
afterEach(cleanup);
it('focuses one target while preserving exposure and scientific boundary text', async () => {
  render(<EvidenceView />);
  expect(screen.getByRole('heading', { name: 'Candidate evidence' })).toBeTruthy();
  const second = evidence.targets[1]!;
  fireEvent.click(screen.getByRole('tab', { name: second.symbol }));
  expect(await screen.findByRole('tabpanel', { name: second.symbol })).toBeTruthy();
  expect(screen.getByText(evidence.brain_exposure.summary)).toBeTruthy();
  expect(screen.getAllByText(evidence.boundary).length).toBeGreaterThan(0);
});
