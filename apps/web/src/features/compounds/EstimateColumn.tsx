import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, Term, type Tone } from "@/components/system";
import { badgeTip } from "@/components/system/badgeTips";
import type { Estimate } from "./useEstimates";

/** Column label in the My compounds results table. Never used for ranking. */
export const ESTIMATE_COLUMN = "AI estimate";

const BASIS: Record<NonNullable<Estimate["basis"]>, { label: string; tone: Tone }> = {
  held_out: { label: "held out", tone: "neutral" },
  // Amber: the model saw this compound, so the estimate flatters it.
  in_training: { label: "in training", tone: "gap" },
  new_structure: { label: "new structure", tone: "neutral" },
};

const NO_ESTIMATE: Record<Estimate["status"], string> = {
  stored: "n/a",
  computed: "n/a",
  no_structure: "no structure",
  invalid_structure: "no structure",
  unknown_id: "n/a",
};

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

/** Header cell content: the column name with the glossary explanation on hover. */
export function EstimateHeader() {
  return (
    <span className="inline-flex justify-end">
      <Term tip={badgeTip(ESTIMATE_COLUMN)}>{ESTIMATE_COLUMN}</Term>
    </span>
  );
}

/**
 * Structure-only estimate for one row, with its basis tag. When the compound has a measured
 * discovery score it is shown above the estimate and stays visually primary.
 */
export function EstimateCell({ estimate, loading = false }: { estimate?: Estimate; loading?: boolean }) {
  if (!estimate) {
    return loading ? (
      <Skeleton className="ml-auto h-4 w-16 rounded-full bg-ink/[0.06]" />
    ) : (
      <span className="text-ink-3">n/a</span>
    );
  }
  if (estimate.estimate == null || !estimate.basis) {
    return <span className="text-[12px] text-ink-3">{NO_ESTIMATE[estimate.status]}</span>;
  }
  const basis = BASIS[estimate.basis];
  // Two short lines keep the column narrow: values (measured primary), then the basis tag.
  return (
    <div className="flex flex-col items-end gap-1 whitespace-nowrap leading-none">
      <span className="inline-flex items-baseline gap-1.5">
        {estimate.measured != null && (
          <>
            <span className="text-[11px] text-ink-3">measured</span>
            <span className="font-mono font-medium tabular-nums text-ink">{signed(estimate.measured)}</span>
          </>
        )}
        <span
          className="font-mono text-[12px] tabular-nums text-ink-3"
          aria-label={`AI estimate ${signed(estimate.estimate)}`}
        >
          AI {signed(estimate.estimate)}
        </span>
      </span>
      <StatusBadge size="sm" tone={basis.tone} className="h-[18px] px-1.5 text-[10.5px]">
        {basis.label}
      </StatusBadge>
    </div>
  );
}

/** One line under the results table. */
export function EstimateCaption() {
  return (
    <p className="px-3 pt-2 text-[12px] text-ink-3">
      Estimated from structure. Exploratory, not part of the ranking.
    </p>
  );
}
