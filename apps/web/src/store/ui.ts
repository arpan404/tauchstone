import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AttackMode = 'attack' | 'learn';
export type StepId = 'signature' | 'candidates' | 'evidence' | 'attack' | 'benchmark' | 'lab';

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

export const useUi = create<UiState>()(persist((set) => ({
  selectedCandidateId: null,
  mode: 'attack',
  step: 'candidates',
  sessionId: null,
  selectCandidate: (id) => set((state) => state.selectedCandidateId === id ? {} : { selectedCandidateId: id, sessionId: null }),
  setMode: (mode) => set({ mode }),
  setStep: (step) => set({ step }),
  setSessionId: (id) => set({ sessionId: id }),
}), {
  name: 'tauchstone-investigation-selection',
  partialize: (state) => ({ selectedCandidateId: state.selectedCandidateId }),
}));

export const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'candidates', label: 'Candidates', hint: 'Discovery ranking' },
  { id: 'lab', label: 'AI lab', hint: 'Ask and train' },
  { id: 'signature', label: 'Disease signature', hint: 'AD minus control' },
  { id: 'evidence', label: 'Evidence', hint: 'Targets and exposure' },
  { id: 'attack', label: 'Experiments', hint: 'Held-out validation' },
  { id: 'benchmark', label: 'Benchmark', hint: 'Policy replay' },
];
