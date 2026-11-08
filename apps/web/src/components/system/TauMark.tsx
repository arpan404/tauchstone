import { cn } from "cn";

/**
 * The two hooks of the mark. A tau filament is two protofilaments wound around
 * each other, and a cut across one (PDB 5O3L, from an Alzheimer's brain) shows
 * two C-shaped folds facing opposite ways. These are those folds, idealised.
 * Facing opposite ways is also what the app looks for in a drug.
 */
export const TAU_FOLD_A = "M34 12a15 15 0 1 0 11 22";
export const TAU_FOLD_B = "M30 52a15 15 0 1 0-11-22";

/** The app mark, drawn in currentColor so it follows the theme. */
export function TauMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-6", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={9}
      strokeLinecap="round"
    >
      {title && <title>{title}</title>}
      <path d={TAU_FOLD_A} />
      <path d={TAU_FOLD_B} />
    </svg>
  );
}
