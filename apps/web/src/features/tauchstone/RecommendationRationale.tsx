import type { Schema } from '@/api/types';

type Mode = Schema<'AttackSession'>['mode'];
const modeName = (mode: Mode) => mode === 'learn' ? 'Learn' : 'Attack';

/** A mode toggle does not fetch a recommendation; attribute the last API response. */
export function RecommendationRationale({
  responseMode, selectedMode, rationale,
}: { responseMode: Mode; selectedMode: Mode; rationale: string }) {
  const stale = responseMode !== selectedMode;
  return (
    <div className="space-y-1 text-xs text-neutral-500" aria-live="polite">
      <p>
        {stale ? `Last server recommendation (${modeName(responseMode)})` : `${modeName(responseMode)} recommendation`}: {rationale}
      </p>
      {stale && (
        <p className="text-[var(--warning)]">
          {modeName(selectedMode)} is selected for the next validation. The highlighted well is still the last {modeName(responseMode)} recommendation; it refreshes after a reveal. You can also select a well manually.
        </p>
      )}
    </div>
  );
}
