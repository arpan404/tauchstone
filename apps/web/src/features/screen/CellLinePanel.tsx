import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowSquareOutIcon, BrainIcon, GridFourIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { Screen } from "@/api/workspace";
import { NumberTicker, Panel, StatusBadge } from "@/components/system";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type CellLineCard, compositionSentence, useCellLineCards } from "./cellLineCards";

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
  const { data: cards } = useCellLineCards();
  const composition = compositionSentence(lines, cards);
  // A finished run saved before cell lines were tracked has none to show.
  const untracked = !running && job?.status === "done" && !lines.length;
  // The frozen original run gets its cell lines worked out on the server the first time it is shown.
  const original = String(job?.id ?? "").startsWith("frozen-");
  const caption = lines.length
    ? `${fromSaved ? "Last run: top" : "Top"} ${lines.length} of ${job?.n_cell_lines ?? lines.length} lines by signatures scored`
    : running
      ? "Waiting for the first block"
      : untracked
        ? original ? "Original run: scoring its cell lines" : "Not recorded for this run"
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
          {composition && (
            <p className="m-0 mb-2.5 px-1 text-[13.5px] text-ink-2">
              {composition} Select a line for its origin.
            </p>
          )}
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
                  <Tile line={c} max={max} card={cards?.get(c.cell_id)} />
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
                ? original
                  ? "Working out which cell lines the original run scored. This takes a few seconds."
                  : "This result was saved before cell lines were tracked. Run the screen again to see them."
                : "Run a screen to see each LINCS cell line as it is scored"}
          </p>
        </div>
      )}
    </Panel>
  );
}

const TILE =
  "flex h-full w-full min-w-0 flex-col gap-1 rounded-xl bg-frost/55 px-3 pt-2.5 pb-2 text-left ring-1 ring-rim/80";

function Tile({ line, max, card }: { line: CellLine; max: number; card?: CellLineCard }) {
  if (!card) return <div className={cn(TILE, line.neural && "bg-primary/[0.07] ring-primary/25")}><TileBody line={line} max={max} /></div>;
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          TILE,
          "cursor-pointer outline-none transition-colors hover:bg-primary/[0.08] focus-visible:ring-2 focus-visible:ring-primary data-[popup-open]:bg-primary/10 data-[popup-open]:ring-primary/25",
          line.neural && "bg-primary/[0.07] ring-primary/25",
        )}
      >
        <TileBody line={line} max={max} hint={`Facts about ${card.display_name}`} />
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto rounded-[18px] p-5 shadow-overlay",
          card.image ? "sm:max-w-[780px]" : "sm:max-w-[460px]",
        )}
      >
        <CardBody card={card} />
      </DialogContent>
    </Dialog>
  );
}

function TileBody({ line, max, hint }: { line: CellLine; max: number; hint?: string }) {
  const best = line.best_consensus;
  const label = `${line.cell_id}${line.neural ? ", neural" : ""}: ${line.n_scored.toLocaleString("en-US")} signatures scored, strongest single-signature reversal ${best == null ? "not available" : best.toFixed(2)}${hint ? `. ${hint}` : ""}`;
  return (
    <>
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
    </>
  );
}

const ROWS: [keyof CellLineCard, string][] = [
  ["organ", "Organ or tissue"],
  ["sampled_from", "Sampled from"],
  ["disease", "Donor disease"],
  ["description", "Cell type"],
  ["category", "Category"],
  ["sex", "Donor sex"],
  ["age", "Donor age"],
];

function CardBody({ card }: { card: CellLineCard }) {
  const hasCello = card.cellosaurus_id !== "unspecified";
  const image = card.image;
  // The summary already says what stem-cell derived cells are; do not repeat it as a row.
  const rows = ROWS.filter(
    ([k]) => !(k === "description" && (card.description === "unspecified" || card.category === "stem-cell derived")),
  );
  const facts = (
    <div className="flex min-w-0 flex-col gap-3">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-frost/55 px-3 py-2.5 text-[13.5px] ring-1 ring-rim/80">
        {rows.map(([k, label]) => {
          const v = String(card[k]);
          return (
            <div key={k} className="contents">
              <dt className="text-ink-3">{label}</dt>
              <dd className={cn("m-0 min-w-0 break-words", v === "unspecified" ? "text-ink-3" : "text-ink")}>
                {v === "unspecified" ? "Unspecified" : v.charAt(0).toUpperCase() + v.slice(1)}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="m-0 text-[12.5px] text-ink-3">
        {hasCello ? (
          <>
            Source:{" "}
            <a href={card.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink-2 underline decoration-ink/20 underline-offset-2 hover:text-primary">
              Cellosaurus {card.cellosaurus_id}
              <ArrowSquareOutIcon aria-hidden className="size-3" />
            </a>{" "}
            (CC BY 4.0), with LINCS cell metadata
          </>
        ) : (
          "Source: LINCS cell metadata (GSE92742, GSE70138, LINCS 2020). No Cellosaurus record is linked."
        )}
      </p>
    </div>
  );
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5 pr-8">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DialogTitle className="m-0 font-heading text-[22px] leading-tight font-normal tracking-[-0.02em] text-ink">
            {card.display_name}
          </DialogTitle>
          {card.display_name !== card.cell_id && (
            <span className="font-mono text-[12px] text-ink-3">LINCS id {card.cell_id}</span>
          )}
          {card.neural && (
            <StatusBadge tone="ok">
              <BrainIcon aria-hidden />
              Neural
            </StatusBadge>
          )}
        </div>
        <DialogDescription className="m-0 text-[15px] leading-snug text-ink">{card.summary}</DialogDescription>
      </div>
      {image ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <figure className="m-0 flex min-w-0 flex-col gap-1.5">
            <img
              src={`/api${image.url}`}
              alt={image.caption}
              decoding="async"
              className="aspect-square w-full rounded-xl bg-ink/[0.035] object-cover ring-1 ring-rim/60"
            />
            <figcaption className="text-[12px] leading-snug text-ink-3">
              {image.caption}{" "}
              <a href={image.page_url} target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-ink/20 underline-offset-2 hover:text-primary">
                Image: Human Protein Atlas, {image.licence}
              </a>
            </figcaption>
          </figure>
          {facts}
        </div>
      ) : (
        facts
      )}
    </>
  );
}
