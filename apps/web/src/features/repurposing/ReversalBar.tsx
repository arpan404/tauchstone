import { cn } from "cn";
import { REVERSAL_SCALE } from "./format";

/** Rounded gradient pill for reversal magnitude, light blue to primary. No track. */
export function ReversalBar({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, (-score / REVERSAL_SCALE) * 100));
  return (
    <span aria-hidden className={cn("block h-1.5 w-28", className)}>
      <span
        className="block h-full rounded-full bg-gradient-to-r from-[#8db1ea] to-primary"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}
