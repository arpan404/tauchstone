import { describe, expect, it } from 'vitest';
import { getMockCandidates } from '@/api/mock/candidates';
import { getMockBenchmark } from '@/api/mock/benchmark';
import { benchmarkHeadline, demoCandidates, discoveryCandidate, featuredCandidate, percent } from './data';
import { useStory } from '@/store/story';
describe('story discovery and captions', () => {
  it('chooses only by discovery rank regardless of held-out counts or flags', () => {
    const rows = getMockCandidates().candidates.slice(0, 3).reverse();
    const chosen = discoveryCandidate(rows);
    expect(chosen?.rank).toBe(1);
    expect(discoveryCandidate(rows.map((row) => ({ ...row, n_held_out_contexts: 999, flags: [], is_demo_candidate: false })))?.id).toBe(chosen?.id);
    expect(discoveryCandidate([])).toBeUndefined();
  });
  it('leads with the preregistered primary analysis and preserves unavailable values', () => {
    const data = getMockBenchmark();
    expect(benchmarkHeadline(data).n).toBe(data.n_candidates);
    expect(benchmarkHeadline(data).nSealed).toBe(data.all_candidates?.n_candidates ?? data.n_candidates);
    expect(benchmarkHeadline(data).tauchstone).toBe(data.policies.find((p) => p.policy === 'tauchstone_hybrid')?.decision_accuracy.estimate);
    expect(percent(undefined)).toBe('Unavailable');
    expect(percent(0)).toBe('0.0%');
  });
  it('features the first demo candidate with a structure, else the first demo candidate', () => {
    const rows = getMockCandidates().candidates;
    const demos = demoCandidates(rows);
    expect(demos.length).toBeGreaterThan(0);
    expect(featuredCandidate(rows, [])?.id).toBe(demos[0].id);
    const last = demos[demos.length - 1];
    const card = { candidate_id: last.id, structure: { pdb_id: '1ABC' } } as never;
    expect(featuredCandidate(rows, [card])?.id).toBe(last.id);
  });
  it('bounds manual navigation', () => {
    useStory.getState().go(-1); expect(useStory.getState().index).toBe(0);
    useStory.getState().go(99); expect(useStory.getState().index).toBe(5);
    useStory.getState().go(0);
  });
});
