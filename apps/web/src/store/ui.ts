import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AttackMode = "attack" | "learn";
export type StepId =
  | "signature"
  | "candidates"
  | "evidence"
  | "attack"
  | "benchmark"
  | "projects"
  | "screen"
  | "compare"
  | "compounds"
  | "report";

interface UiState {
  currentProjectId: string | null;
  compareIds: string[];
  setProject: (id: string | null) => void;
  toggleCompare: (id: string) => void;
  selectedCandidateId: string | null;
  mode: AttackMode;
  step: StepId;
  sessionId: string | null;
  selectCandidate: (id: string | null) => void;
  setMode: (mode: AttackMode) => void;
  setStep: (step: StepId) => void;
  setSessionId: (id: string | null) => void;
  /** Name for the next CSV upload, set by New project before a file is chosen. */
  uploadName: string | null;
  setUploadName: (name: string | null) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      currentProjectId: null,
      compareIds: [],
      // Selections belong to one project's ranking; a different project starts clean.
      setProject: (id) =>
        set((state) =>
          state.currentProjectId === id
            ? {}
            : {
                currentProjectId: id,
                selectedCandidateId: null,
                compareIds: [],
                sessionId: null,
              },
        ),
      toggleCompare: (id) =>
        set((state) => ({
          compareIds: state.compareIds.includes(id)
            ? state.compareIds.filter((x) => x !== id)
            : state.compareIds.length < 4
              ? [...state.compareIds, id]
              : state.compareIds,
        })),
      selectedCandidateId: null,
      mode: "attack",
      step: "projects",
      sessionId: null,
      selectCandidate: (id) =>
        set((state) =>
          state.selectedCandidateId === id
            ? {}
            : { selectedCandidateId: id, sessionId: null },
        ),
      setMode: (mode) => set({ mode }),
      setStep: (step) => set({ step }),
      setSessionId: (id) => set({ sessionId: id }),
      uploadName: null,
      setUploadName: (name) => set({ uploadName: name }),
    }),
    {
      name: "tauchstone-investigation-selection",
      partialize: (state) => ({
        selectedCandidateId: state.selectedCandidateId,
        currentProjectId: state.currentProjectId,
        compareIds: state.compareIds,
      }),
    },
  ),
);

export const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: "candidates", label: "Candidates", hint: "Discovery ranking" },
  { id: "signature", label: "Disease signature", hint: "Alzheimer's vs control" },
  { id: "evidence", label: "Evidence", hint: "Targets and exposure" },
  { id: "attack", label: "Experiments", hint: "Held-out validation" },
  { id: "benchmark", label: "Benchmark", hint: "Policy replay" },
];
