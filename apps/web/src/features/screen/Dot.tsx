import { cn } from "cn";

/** Radio indicator for segmented option lists. */
export function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
        on ? "border-primary bg-primary" : "border-line-strong bg-surface",
      )}
    >
      {on && <span className="size-1.5 rounded-full bg-surface" />}
    </span>
  );
}
