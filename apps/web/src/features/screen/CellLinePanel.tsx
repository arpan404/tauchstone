import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { BrainIcon, GridFourIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { Screen } from "@/api/workspace";
import { NumberTicker, Panel, StatusBadge } from "@/components/system";

type CellLine = NonNullable<Screen["cell_lines"]>[number];

/**
 * The real LINCS cell lines being scored, as reported by the screen job: signatures scored
 * per line and the most negative signature score seen so far. Every value comes from the API.
 */
export function CellLinePanel({
  job,
  running,
  fromSaved = false,
  className,
}: {
  job: Screen | null;
  running: boolean;
  /** Showing the project's last saved run, not one started on this visit. */
  fromSaved?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const lines = job?.cell_lines ?? [];
  const max = Math.max(1, ...lines.map((c) => c.n_scored));
  const neural = lines.filter((c) => c.neural).length;
  // A finished run saved before cell lines were tracked has none to show.
  const untracked = !running && job?.status === "done" && !lines.length;
  const caption = lines.length
    ? `${fromSaved ? "Last run: top" : "Top"} ${lines.length} of ${job?.n_cell_lines ?? lines.length} lines by signatures scored`
    : running
      ? "Waiting for the first block"
      : untracked
        ? "Not recorded for this run"
        : "Appears when a screen runs";
  return (
    <Panel
      icon={<GridFourIcon />}
      title="Cell lines being scored"
      caption={caption}
      className={className}
      aria-label="Cell lines being scored"
      actions={
        neural > 0 && (
          <StatusBadge tone="ok">
            <BrainIcon aria-hidden />
            {neural} neural
          </StatusBadge>
        )
      }
      bodyClassName="@container px-3 pt-2 pb-3"
    >
      {lines.length ? (
        <>
          <div
            aria-hidden
            className="mb-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[13.5px] text-ink-3"
          >
            <span>
              <span className="font-mono text-ink">count</span> signatures scored
            </span>
            <span>
              <span className="font-mono font-medium text-primary">score</span> strongest single-signature reversal so far
            </span>
          </div>
          <LayoutGroup>
            <ol
              aria-label="Cell lines, most signatures first"
              className="m-0 grid list-none grid-cols-2 gap-2 p-0 @md:grid-cols-3 @xl:grid-cols-4"
            >
              {lines.map((c) => (
                <motion.li
                  key={c.cell_id}
                  layout={reduce ? false : "position"}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="min-w-0"
                >
                  <Tile line={c} max={max} />
                </motion.li>
              ))}
            </ol>
          </LayoutGroup>
        </>
      ) : (
        <div className="flex h-[170px] flex-col items-center justify-center gap-3 rounded-xl bg-ink/[0.035] text-center">
          <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-primary [&>svg]:size-5">
            <GridFourIcon aria-hidden />
          </span>
          <p className="m-0 max-w-[30ch] text-[14px] text-ink-2">
            {running
              ? "Cell lines fill in as each block of signatures is scored"
              : untracked
                ? "This result was saved before cell lines were tracked. Run the screen again to see them."
                : "Run a screen to see each LINCS cell line as it is scored"}
          </p>
        </div>
      )}
    </Panel>
  );
}

function Tile({ line, max }: { line: CellLine; max: number }) {
  const best = line.best_consensus;
  const label = `${line.cell_id}${line.neural ? ", neural" : ""}: ${line.n_scored.toLocaleString("en-US")} signatures scored, strongest single-signature reversal ${best == null ? "not available" : best.toFixed(2)}`;
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col gap-1 rounded-xl bg-frost/55 px-3 pt-2.5 pb-2 ring-1 ring-rim/80",
        line.neural && "bg-primary/[0.07] ring-primary/25",
      )}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[15px] font-medium text-ink">{line.cell_id}</span>
        {line.neural && (
          <BrainIcon weight="fill" className="size-4 shrink-0 text-primary" aria-hidden />
        )}
      </div>
      <div aria-hidden className="flex min-w-0 items-baseline justify-between gap-2 font-mono tabular-nums">
        <span className="text-[22px] leading-none tracking-[-0.03em] text-ink">
          <NumberTicker value={line.n_scored} />
        </span>
        <span
          className={cn(
            "text-[14px] font-medium",
            best != null && best < 0 ? "text-primary" : "text-ink-3",
          )}
        >
          {best == null ? "n/a" : best.toFixed(2)}
        </span>
      </div>
      <span className="mt-0.5 block h-1 rounded-full bg-ink/[0.06]" aria-hidden>
        <span
          className="block h-full rounded-full bg-primary/55 transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${(line.n_scored / max) * 100}%` }}
        />
      </span>
    </div>
  );
}
