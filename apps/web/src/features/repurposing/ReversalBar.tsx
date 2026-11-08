import { cn } from "cn";
import { REVERSAL_SCALE } from "./format";

/** Slim accent bar for reversal magnitude. No background track. */
export function ReversalBar({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, (-score / REVERSAL_SCALE) * 100));
  return (
    <span aria-hidden className={cn("block h-1 w-28", className)}>
      <span
        className="block h-full rounded-[1px] bg-primary"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}
