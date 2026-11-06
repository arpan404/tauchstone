import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Schema } from '@/api/types';

type Mode = Schema<'AttackSession'>['mode'];
const modeName = (mode: Mode) => mode === 'learn' ? 'Learn' : 'Attack';

/** A mode toggle does not fetch a recommendation; attribute the last API response. */
export function RecommendationRationale({
  responseMode, selectedMode, rationale,
}: { responseMode: Mode; selectedMode: Mode; rationale: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = rationale.length > 180;
  const stale = responseMode !== selectedMode;
  return (
    <div className="space-y-1 text-xs text-muted-foreground" aria-live="polite">
      <p className={long && !expanded ? 'line-clamp-2' : undefined}>
        {stale ? `Last server recommendation (${modeName(responseMode)})` : `${modeName(responseMode)} recommendation`}: {rationale}
      </p>
      {long && <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse rationale' : 'Read full rationale'}</Button>}
      {stale && (
        <p className="text-muted-foreground">
          {modeName(selectedMode)} is selected for the next validation. The highlighted experiment is still the last {modeName(responseMode)} recommendation; it refreshes after a reveal. You can also select an experiment manually.
        </p>
      )}
    </div>
  );
}
