import { create } from 'zustand'

export type AttackMode = 'attack' | 'learn'

interface UiState {
  selectedCandidateId: string | null
  mode: AttackMode
  selectCandidate: (id: string | null) => void
  setMode: (mode: AttackMode) => void
}

export const useUi = create<UiState>((set) => ({
  selectedCandidateId: null,
  mode: 'attack',
  selectCandidate: (id) => set({ selectedCandidateId: id }),
  setMode: (mode) => set({ mode }),
}))
