import { create } from 'zustand';
import type { StepId } from './ui';
export const STORY_STEPS: { title: string; time: string; view: StepId }[] = [
  { title: 'Signature', time: '0:00', view: 'signature' },
  { title: 'Ranking', time: '0:20', view: 'candidates' },
  { title: 'Evidence + structure', time: '0:50', view: 'evidence' },
  { title: 'Attack', time: '1:15', view: 'attack' },
  { title: 'Benchmark', time: '2:15', view: 'benchmark' },
  { title: 'Boundary', time: '2:40', view: 'benchmark' },
];
export const useStory = create<{ index: number; go: (index: number) => void }>((set) => ({
  index: 0,
  go: (index) => set({ index: Math.max(0, Math.min(STORY_STEPS.length - 1, index)) }),
}));
