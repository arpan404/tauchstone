import type { AttackMode } from '@/store/ui';

/** What each mode optimises; the server picks the recommended test for the session's mode. */
export const MODE_HELP: Record<AttackMode, string> = {
  attack: 'Suggest the test most likely to break the claim',
  learn: 'Suggest the test expected to move the chance the claim holds the most',
};
/** Shown under the mode switch: one line per option. */
export const MODE_LINE: Record<AttackMode, string> = {
  attack: 'Likely to fail: the test most likely to break the claim. Validation shows this reaches the right verdict in fewer tests than picking at random.',
  learn: 'Informative: the test expected to move the chance the most.',
};
export const FAIL_RISK_HELP = 'Model estimate of the chance this test fails, before you run it';
export const P_CLAIM_HELP =
  'Starts from how often each kind of test passed for other drugs (a separate development set, not these drugs). A pass pushes it up, a fail pushes it down.';

/** A display name for the drug; the BRD id only when no name exists anywhere. */
export function drugDisplayName(id: string | null, ...names: (string | null | undefined)[]): string | null {
  const named = names.find((n) => n && n !== id && !/^BRD-/i.test(n));
  return named ?? names.find((n) => !!n) ?? id;
}

/** Hint text with exactly one full stop between sentences. */
export function joinSentences(...parts: (string | null | undefined)[]): string {
  return parts.filter((x): x is string => !!x).map((x) => x.trim().replace(/[.\s]+$/, '')).join('. ');
}

/** Preregistered budget (preregistration.yaml `budget: 5`); a drug with fewer hidden tests gets fewer. */
export const PREREG_BUDGET = 5;
export const budgetFor = (nTests: number) => Math.max(0, Math.min(PREREG_BUDGET, nTests));

/** Verdict cut-offs from preregistration.yaml `verdict_thresholds`, for display only. */
export const VERDICT_CUTOFFS = { supported: 0.8, fragile: 0.2 } as const;

/** Whole-number percent for a probability. */
export const pct = (p: number) => `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;

/** The claim in plain words. The API text says 'AD signature'; spell it out here. */
export function claimSentence(name: string, q = 0.7): string {
  return `${name} pushes Alzheimer's genes the opposite way in at least ${Math.round(q * 100)}% of the checks set aside in advance.`;
}

export const WHY_LINE =
  'A ranking from one dataset can be a fluke. These checks were set aside before anyone saw results.';

export type TestKind = 'held_out_cohort' | 'composition_adjusted' | 'lincs_context' | 'brain_exposure' | 'cell_type';

/** Plain title, the question each kind of hidden test asks, and its pass rule in plain words. */
export const TEST_KIND: Record<TestKind, { title: string; checks: string; passRule: string }> = {
  held_out_cohort: {
    title: 'Different people',
    checks: 'Does the reversal hold in brains from different donors?',
    passRule: "Passes if the drug ranks in the top 25% of drugs against that group's signature.",
  },
  composition_adjusted: {
    title: 'Cell loss corrected',
    checks: 'Does the reversal survive correcting for neuron loss?',
    passRule: 'Passes if the drug still ranks in the top 25% of drugs after the correction.',
  },
  lincs_context: {
    title: 'Held-back lab measurement',
    checks: 'Does the reversal hold in a lab condition left out of the ranking?',
    passRule: 'Passes if its reversal score is at or below the threshold fixed in advance (about -0.66).',
  },
  brain_exposure: {
    title: 'Reaches the brain?',
    checks: 'Is there evidence the drug gets into the brain?',
    passRule: 'Passes on measured human brain data, brain/plasma Kp of 0.1 or more, or PAMPA-BBB of 4e-6 cm/s or more.',
  },
  cell_type: {
    title: 'Brain cell type',
    checks: 'Does the reversal hold in a specific brain cell type?',
    passRule: 'Passes under the preregistered rule for this test.',
  },
};

export const kindOf = (type: string) => TEST_KIND[type as TestKind] ?? { title: type, checks: '', passRule: '' };

/** One line on how many tests a session may run. */
export function budgetText(nTests: number): string {
  const b = budgetFor(nTests);
  if (nTests <= 0) return 'No hidden tests available';
  if (b === nTests) return `${nTests} ${nTests === 1 ? 'test' : 'tests'} available`;
  return `${b} of ${nTests} tests can be run (budget fixed in advance)`;
}

/** End-of-session summary sentence. */
export function summarySentence(passed: number, failed: number, p: number, verdictText: string): string {
  const n = passed + failed;
  return `After ${n} ${n === 1 ? 'test' : 'tests'}: ${passed} passed, ${failed} failed. Chance the claim holds: ${pct(p)}. Verdict: ${verdictText}.`;
}

/**
 * When enough tests have failed that fewer than q of all n tests could pass, the claim cannot
 * hold whatever the rest show. Derived from the claim definition only.
 */
export function cannotHoldLine(failed: number, n: number, q = 0.7): string | null {
  if (n <= 0 || failed <= 0) return null;
  const allowed = n - Math.ceil(q * n - 1e-9);
  if (failed <= allowed) return null;
  return `With ${n} tests in total, ${failed} ${failed === 1 ? 'fail' : 'fails'} already means fewer than ${Math.round(q * 100)}% can pass, so the claim cannot hold whatever the rest show.`;
}
