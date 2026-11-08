import { cn } from "cn";

/** A cut stone, eight sided. */
export const STONE =
  "M59.72 43.48L43.48 59.72L20.52 59.72L4.28 43.48L4.28 20.52L20.52 4.28L43.48 4.28L59.72 20.52Z";
/** The bar of the tau. */
export const TAU_BAR = "M19.6 21.15H44.4V26.73H19.6Z";
/** The stem of the tau, hooking right. */
export const TAU_STEM =
  "M28.9 21.15H34.48V32.31c0 3.1 1.86 4.96 4.96 4.96H41.3V42.85H38.82c-6.2 0-9.92-3.72-9.92-9.92Z";

/**
 * The app mark: tau, the protein that tangles in Alzheimer's disease, cut into
 * a touchstone, the stone an assayer rubs a sample against to judge it. One
 * flat shape with the letter knocked out, so it works in any single colour.
 */
export function TauMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-6", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="currentColor"
      fillRule="evenodd"
    >
      {title && <title>{title}</title>}
      <path d={`${STONE}${TAU_BAR}${TAU_STEM}`} />
    </svg>
  );
}
