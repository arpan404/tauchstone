import type { AttackMode } from '@/store/ui';

/** What each mode optimises; the server picks the recommended test for the session's mode. */
export const MODE_HELP: Record<AttackMode, string> = {
  attack: 'Suggest the test most likely to break the claim',
  learn: 'Suggest the test expected to move the chance the claim holds the most',
};
export const FAIL_RISK_HELP = 'Model estimate of the chance this test fails, before you run it';
export const P_CLAIM_HELP =
  'Model estimate (0 to 1) that the claim holds across all the preset hidden tests. Each result moves it. 0.8 or more is SUPPORTED SO FAR; 0.2 or less is FRAGILE / CONTEXT-DEPENDENT';

/** A display name for the drug; the BRD id only when no name exists anywhere. */
export function drugDisplayName(id: string | null, ...names: (string | null | undefined)[]): string | null {
  const named = names.find((n) => n && n !== id && !/^BRD-/i.test(n));
  return named ?? names.find((n) => !!n) ?? id;
}

/** Hint text with exactly one full stop between sentences. */
export function joinSentences(...parts: (string | null | undefined)[]): string {
  return parts.filter((x): x is string => !!x).map((x) => x.trim().replace(/[.\s]+$/, '')).join('. ');
}
