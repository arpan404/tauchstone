import { cn } from "cn";

/** Wells that spell tau, as (column, row) on a 4 x 4 plate: bar, stem, hook. */
const LIT = new Set(["0,0", "1,0", "2,0", "3,0", "1,1", "1,2", "2,3"]);
const WELLS = Array.from({ length: 16 }, (_, i) => ({ col: i % 4, row: Math.floor(i / 4) }));

/**
 * The app mark: the Greek letter tau written in the wells of a screening plate.
 * Tau is the protein that tangles in Alzheimer's disease and the first half of
 * the name; the plate is what a screen runs on. Drawn in currentColor, empty
 * wells at low opacity, so it follows the theme.
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
    >
      {title && <title>{title}</title>}
      {WELLS.map(({ col, row }) => (
        <circle
          key={`${col},${row}`}
          cx={11 + col * 14}
          cy={11 + row * 14}
          r={6}
          fillOpacity={LIT.has(`${col},${row}`) ? 1 : 0.2}
        />
      ))}
    </svg>
  );
}
