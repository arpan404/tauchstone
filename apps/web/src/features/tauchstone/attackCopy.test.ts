import { describe, expect, it } from 'vitest';
import {
  budgetFor, budgetText, cannotHoldLine, claimSentence, MODE_HELP, MODE_LINE, P_CLAIM_HELP, summarySentence, TEST_KIND, WHY_LINE,
} from './attackCopy';

describe('attack copy', () => {
  it('fixes the budget at min(5, hidden tests)', () => {
    expect(budgetFor(3)).toBe(3);
    expect(budgetFor(10)).toBe(5);
    expect(budgetText(3)).toBe('3 tests available');
    expect(budgetText(1)).toBe('1 test available');
    expect(budgetText(10)).toBe('5 of 10 tests can be run (budget fixed in advance)');
  });

  it('states the claim in plain words with Alzheimer\'s spelled out', () => {
    expect(claimSentence('Ticrynafen', 0.7)).toBe(
      "Ticrynafen pushes Alzheimer's genes the opposite way in at least 70% of the checks set aside in advance.");
  });

  it('summarises the session with the exact verdict name', () => {
    expect(summarySentence(2, 1, 0.613, 'INSUFFICIENT EVIDENCE')).toBe(
      'After 3 tests: 2 passed, 1 failed. Chance the claim holds: 61%. Verdict: INSUFFICIENT EVIDENCE.');
  });

  it('says the claim cannot hold only when too many tests failed', () => {
    expect(cannotHoldLine(1, 3, 0.7)).toContain('cannot hold');
    expect(cannotHoldLine(0, 3, 0.7)).toBeNull();
    expect(cannotHoldLine(3, 10, 0.7)).toBeNull();
    expect(cannotHoldLine(4, 10, 0.7)).toContain('4 fails');
  });

  it('uses no dashes and no clinical language', () => {
    const all = [
      WHY_LINE, P_CLAIM_HELP, ...Object.values(MODE_HELP), ...Object.values(MODE_LINE),
      ...Object.values(TEST_KIND).flatMap((k) => [k.title, k.checks, k.passRule]),
      claimSentence('X'), cannotHoldLine(1, 3) ?? '', budgetText(10),
    ].join(' ');
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/\b(treats?|effective|safe|doses?|dosing|cure|patients?)\b/i);
  });
});
