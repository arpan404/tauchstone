import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { contextIcon, exposureLabel } from './labels';
import { verdictLabel } from '@/api/mock/attack';

describe('label mappings', () => {
  it('verdict labels use the contract wording only', () => {
    expect(verdictLabel('SUPPORTED_SO_FAR')).toBe('Supported so far');
    expect(verdictLabel('FRAGILE_CONTEXT_DEPENDENT')).toBe('Fragile / context-dependent');
    expect(verdictLabel('INSUFFICIENT_EVIDENCE')).toBe('Insufficient evidence');
  });

  it('exposure levels are always labelled explicitly', () => {
    expect(exposureLabel('predicted')).toBe('predicted');
    expect(exposureLabel('measured_human_cns')).toBe('measured human CNS');
    expect(exposureLabel('none')).toBe('none');
  });

  it('every context type has an icon', () => {
    for (const t of ['held_out_cohort', 'composition_adjusted', 'lincs_context', 'brain_exposure', 'cell_type'] as const) {
      expect(contextIcon(t).length).toBeGreaterThan(0);
    }
  });
});

describe('ui store (zustand)', () => {
  it('tracks selection and step', async () => {
    const { useUi } = await import('@/store/ui');
    useUi.getState().selectCandidate('MOCK-0001');
    expect(useUi.getState().selectedCandidateId).toBe('MOCK-0001');
    useUi.getState().setStep('attack');
    expect(useUi.getState().step).toBe('attack');
    useUi.getState().selectCandidate(null);
    useUi.getState().setStep('signature');
    expect(useUi.getState().selectedCandidateId).toBeNull();
  });

  it('vanilla zustand create works in this environment', () => {
    const s = create<{ n: number }>()(() => ({ n: 1 }));
    expect(s.getState().n).toBe(1);
  });
});
