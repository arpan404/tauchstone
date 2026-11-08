import { cn } from "cn";

/**
 * Two half rings facing opposite ways, drawn on a 64 grid with flat ends:
 * the upper ring opens one way, the lower ring the other. The app looks for a
 * drug whose effect runs opposite to the disease, and that is the shape of it.
 */
export const RING_UPPER = "M32 11a16 16 0 0 1 0 32";
export const RING_LOWER = "M32 53a16 16 0 0 1 0-32";

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
      strokeWidth={10}
    >
      {title && <title>{title}</title>}
      <path d={RING_UPPER} />
      <path d={RING_LOWER} />
    </svg>
  );
}
