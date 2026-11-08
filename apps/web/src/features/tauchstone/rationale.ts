import type { Schema } from '@/api/types';

type Mode = Schema<'AttackSession'>['mode'];
const modeName = (mode: Mode) => (mode === 'learn' ? 'Informative' : 'Likely to fail');

/**
 * Tooltip copy for the recommended test. A mode toggle does not fetch a new recommendation,
 * so a stale pick is attributed to the mode of the last API response.
 */
export function rationaleCopy(responseMode: Mode, selectedMode: Mode, rationale: string) {
  const stale = responseMode !== selectedMode;
  return {
    stale,
    title: stale ? `Earlier suggestion (${modeName(responseMode)})` : `Suggested (${modeName(responseMode)})`,
    body: rationale,
    note: stale ? `${modeName(selectedMode)} applies after the next result` : null,
    /** Badge text on a stale pick: whose recommendation it still is. */
    badge: 'Earlier pick',
  };
}
