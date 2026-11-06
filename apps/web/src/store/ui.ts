import { create } from 'zustand';

export type AttackMode = 'attack' | 'learn';
export type StepId = 'signature' | 'candidates' | 'evidence' | 'attack' | 'benchmark';

interface UiState {
  selectedCandidateId: string | null;
  mode: AttackMode;
  step: StepId;
  sessionId: string | null;
  selectCandidate: (id: string | null) => void;
  setMode: (mode: AttackMode) => void;
  setStep: (step: StepId) => void;
  setSessionId: (id: string | null) => void;
}

export const useUi = create<UiState>((set) => ({
  selectedCandidateId: null,
  mode: 'attack',
  step: 'signature',
  sessionId: null,
  selectCandidate: (id) => set({ selectedCandidateId: id }),
  setMode: (mode) => set({ mode }),
  setStep: (step) => set({ step }),
  setSessionId: (id) => set({ sessionId: id }),
}));

export const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'signature', label: '1 · Signature', hint: 'AD minus control volcano' },
  { id: 'candidates', label: '2 · Candidates', hint: 'Reversal ranking' },
  { id: 'evidence', label: '3 · Evidence', hint: 'Targets + exposure' },
  { id: 'attack', label: '4 · Attack', hint: 'Break the claim' },
  { id: 'benchmark', label: '5 · Benchmark', hint: 'Policy replay' },
];
