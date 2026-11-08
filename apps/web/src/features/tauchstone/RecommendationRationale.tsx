import type { Schema } from '@/api/types';
import { StatusBadge } from '@/components/system';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { rationaleCopy } from './rationale';

type Mode = Schema<'AttackSession'>['mode'];

/** Small 'Recommended' badge on a hidden-test row; the server rationale lives in its tooltip. */
export function RecommendedBadge({
  responseMode, selectedMode, rationale,
}: { responseMode: Mode; selectedMode: Mode; rationale: string }) {
  const copy = rationaleCopy(responseMode, selectedMode, rationale);
  return (
    <Tooltip>
      <TooltipTrigger render={<span />} className="inline-flex">
        <StatusBadge tone={copy.stale ? 'neutral' : 'accent'}>{copy.stale ? copy.badge : 'Recommended'}</StatusBadge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 flex-col items-start gap-1 text-left">
        <span className="font-medium">{copy.title}</span>
        <span className="opacity-80">{copy.body}</span>
        {copy.note && <span className="opacity-80">{copy.note}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
