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
  step: 'candidates',
  sessionId: null,
  selectCandidate: (id) => set({ selectedCandidateId: id }),
  setMode: (mode) => set({ mode }),
  setStep: (step) => set({ step }),
  setSessionId: (id) => set({ sessionId: id }),
}));

export const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'candidates', label: 'Candidates', hint: 'Discovery ranking' },
  { id: 'signature', label: 'Disease signature', hint: 'AD minus control' },
  { id: 'evidence', label: 'Evidence', hint: 'Targets and exposure' },
  { id: 'attack', label: 'Experiments', hint: 'Held-out validation' },
  { id: 'benchmark', label: 'Benchmark', hint: 'Policy replay' },
];
