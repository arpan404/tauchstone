import { cn } from "cn";

export type WellState = "empty" | "scored" | "hit" | "sealed" | "survive" | "fail" | "next";

const ROWS = "ABCDEFGHIJKLMNOP".split("");
const COLS = 24;
export const PLATE_WELLS = ROWS.length * COLS; // 384, the LINCS L1000 plate format

const FILL: Record<WellState, string> = {
  empty: "bg-ink/[0.06] border-transparent",
  scored: "bg-primary/35 border-transparent",
  hit: "bg-primary border-transparent",
  sealed: "bg-ink/80 border-transparent",
  next: "bg-surface border-primary border-2",
  survive: "bg-ok border-transparent",
  fail: "bg-bad border-transparent",
};

/**
 * 384-well plate, the format LINCS L1000 profiles are run on. Pass `progress` (0..1) to fill wells
 * column by column like a reader sweep, or `wells` for explicit per-well states.
 */
export function PlateMap({
  progress,
  wells,
  hits = 0,
  axes = true,
  className,
  label = "Plate map",
}: {
  progress?: number;
  wells?: WellState[];
  /** Wells to mark as hits (first N filled wells), for the live screen. */
  hits?: number;
  axes?: boolean;
  className?: string;
  label?: string;
}) {
  const filled = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * PLATE_WELLS);
  const stateAt = (r: number, c: number): WellState => {
    const i = c * ROWS.length + r; // column-major, as a reader sweeps
    if (wells) return wells[i] ?? "empty";
    if (i >= filled) return "empty";
    return i < hits ? "hit" : "scored";
  };
  return (
    <div className={cn("inline-grid select-none", className)} role="img" aria-label={label}>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `${axes ? "14px " : ""}repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {axes && <span />}
        {axes &&
          Array.from({ length: COLS }, (_, c) => (
            <span key={c} className="text-center font-mono text-[9px] leading-3 text-ink-3">
              {c + 1}
            </span>
          ))}
        {ROWS.map((row, r) => (
          <div key={row} className="contents">
            {axes && <span className="font-mono text-[9px] leading-none text-ink-3 self-center">{row}</span>}
            {Array.from({ length: COLS }, (_, c) => (
              <span
                key={c}
                className={cn(
                  "aspect-square rounded-full border transition-colors duration-300 motion-reduce:transition-none",
                  FILL[stateAt(r, c)],
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small brand mark: a 3x4 corner of a plate. */
export function PlateMark({ className }: { className?: string }) {
  const on = [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1];
  return (
    <span className={cn("grid grid-cols-4 gap-[2px]", className)} aria-hidden>
      {on.map((v, i) => (
        <span key={i} className={cn("size-[5px] rounded-full", v ? "bg-primary" : "bg-primary/25")} />
      ))}
    </span>
  );
}
