import type { AttackMode } from '@/store/ui';

/** What each mode optimises; the server picks the recommended test for the session's mode. */
export const MODE_HELP: Record<AttackMode, string> = {
  attack: 'Run the test most likely to break the claim',
  learn: 'Run the test expected to change the verdict most',
};
export const FAIL_RISK_HELP = 'Model chance this test fails the claim, before it is revealed';
export const P_CLAIM_HELP = 'Model probability that the claim holds across the predefined validation contexts';

/** A display name for the drug; the BRD id only when no name exists anywhere. */
export function drugDisplayName(id: string | null, ...names: (string | null | undefined)[]): string | null {
  const named = names.find((n) => n && n !== id && !/^BRD-/i.test(n));
  return named ?? names.find((n) => !!n) ?? id;
}

/** Hint text with exactly one full stop between sentences. */
export function joinSentences(...parts: (string | null | undefined)[]): string {
  return parts.filter((x): x is string => !!x).map((x) => x.trim().replace(/[.\s]+$/, '')).join('. ');
}
