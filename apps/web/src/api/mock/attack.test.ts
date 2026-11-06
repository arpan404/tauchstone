import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetMockAttack,
  runMockExperiment,
  startMockAttack,
  verdictFor,
} from './attack';

beforeEach(() => {
  resetMockAttack();
});

describe('mock attack simulator invariants', () => {
  it('starts with full budget, no history, and a recommendation', () => {
    const s = startMockAttack('MOCK-0001', 'attack', 5);
    expect(s.budget).toBe(5);
    expect(s.budget_remaining).toBe(5);
    expect(s.history).toEqual([]);
    expect(s.recommended_context_id).not.toBeNull();
    expect((s.rationale ?? '').length).toBeGreaterThan(0);
  });

  it('hidden contexts expose no outcome or value before reveal', () => {
    const s = startMockAttack('MOCK-0001', 'attack', 5);
    for (const c of s.contexts) {
      expect(c.status).toBe('hidden');
      expect(c.outcome).toBeNull();
      expect('value' in c).toBe(false);
      expect('threshold' in c).toBe(false);
    }
  });

  it('budget decrements by exactly one and outcome appears only after run', () => {
    const s = startMockAttack('MOCK-0005', 'attack', 5);
    const target = s.recommended_context_id!;
    const r = runMockExperiment(s.session_id, target, 'attack');
    expect(r.budget_remaining).toBe(4);
    expect(r.history).toHaveLength(1);
    expect(['survive', 'fail']).toContain(r.revealed.outcome);
    expect(r.revealed.belief_before).not.toBe(r.revealed.belief_after);
    // The revealed context is marked; the rest stay hidden.
    const revealedCtx = r.contexts.find((c) => c.context_id === target);
    expect(revealedCtx?.status).toBe('revealed');
    expect(r.contexts.filter((c) => c.status === 'hidden')).toHaveLength(5);
  });

  it('rejects re-running a revealed context (409)', () => {
    const s = startMockAttack('MOCK-0001', 'attack', 5);
    const target = s.recommended_context_id!;
    runMockExperiment(s.session_id, target, 'attack');
    expect(() => runMockExperiment(s.session_id, target, 'attack')).toThrowError(/already revealed/);
  });

  it('rejects unknown sessions and contexts and exhausted budgets', () => {
    expect(() => runMockExperiment('nope', 'ctx-x')).toThrowError(/Unknown attack session/);
    const s = startMockAttack('MOCK-0001', 'attack', 1);
    expect(() => runMockExperiment(s.session_id, 'ctx-unknown')).toThrowError(/Unknown context/);
    runMockExperiment(s.session_id, s.recommended_context_id!, 'attack');
    expect(() => runMockExperiment(s.session_id, 'ctx-mcf7', 'attack')).toThrowError(/Budget exhausted/);
  });

  it('verdict mapping follows the contract labels', () => {
    expect(verdictFor(0.8)).toBe('SUPPORTED_SO_FAR');
    expect(verdictFor(0.4)).toBe('FRAGILE_CONTEXT_DEPENDENT');
    expect(verdictFor(0.1)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('learn mode recommends by uncertainty, attack by lowest p_survive', () => {
    const a = startMockAttack('MOCK-0001', 'attack', 5);
    const l = startMockAttack('MOCK-0001', 'learn', 5);
    const lowestP = [...a.contexts].sort((x, y) => x.p_survive - y.p_survive)[0];
    expect(a.recommended_context_id).toBe(lowestP.context_id);
    const closestHalf = [...l.contexts].sort(
      (x, y) => Math.abs(x.p_survive - 0.5) - Math.abs(y.p_survive - 0.5),
    )[0];
    expect(l.recommended_context_id).toBe(closestHalf.context_id);
  });
});
