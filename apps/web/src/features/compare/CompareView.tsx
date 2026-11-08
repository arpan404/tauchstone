import { useEffect, useState, type ReactNode } from "react";
import {
  BrainIcon,
  ChartLineDownIcon,
  ColumnsIcon,
  ListChecksIcon,
  PlusIcon,
  RowsIcon,
  SealCheckIcon,
  WarningCircleIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import type { Schema } from "@/api/types";
import { EmptyState, StatusBadge, Term, Toolbar, WithdrawnBadge, type GlossaryKey } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUi } from "@/store/ui";
import { ReversalBar } from "../repurposing/ReversalBar";
import { exposureTone, sentence } from "../repurposing/format";

type Detail = Schema<"DrugDetail">;
type Entry = { id: string; detail?: Detail; error?: boolean };
export interface CompareViewProps {
  drugIds: string[];
  projectId?: string;
}
const unspecified = "unspecified";
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

type Row = {
  label: string;
  term?: GlossaryKey;
  /** Higher is better; omit for rows that are not ranked. */
  metric?: (d: Detail) => number;
  value: (d: Detail, best: boolean) => ReactNode;
};

/** Best value gets a soft blue pill; others stay plain ink. */
const num = (best: boolean) =>
  cn(
    "inline-flex font-mono tabular-nums",
    best ? "-ml-1.5 rounded-full bg-primary/10 px-1.5 font-medium text-primary" : "text-ink",
  );

function Values({ values, unit, empty = unspecified, max = 8 }: { values: (string | number)[]; unit?: string; empty?: string; max?: number }) {
  if (!values.length) return <span className="text-ink-3">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[12.5px] text-ink-2 tabular-nums">
      {values.slice(0, max).map((v, i, shown) => (
        <span key={String(v)} className="whitespace-nowrap">
          {v}
          {unit && i === shown.length - 1 && values.length <= max && <span className="ml-1 text-ink-3">{unit}</span>}
        </span>
      ))}
      {values.length > max && (
        <span className="whitespace-nowrap text-ink-3">
          +{values.length - max}
          {unit && ` ${unit}`}
        </span>
      )}
    </span>
  );
}

const cellLines = (d: Detail) => uniq(d.contexts.map((c) => c.cell_id));
const brainCells = (d: Detail) => d.gaps.brain_cells;
const exposureText = (d: Detail) => {
  const { level, label } = d.gaps.exposure;
  return label && label.startsWith(level) ? label : `${level} ${label || unspecified}`;
};

const ROWS: Row[] = [
  {
    label: "Reversal",
    term: "reversal",
    value: (d) => (
      <span className="flex flex-col gap-1.5">
        <ReversalBar score={d.consensus} className="w-full max-w-40" />
        {d.scores && (
          <span className="flex flex-wrap gap-x-3 font-mono text-[11.5px] whitespace-nowrap text-ink-3 tabular-nums">
            <span>WTCS {d.scores.wtcs.toFixed(2)}</span>
            <span>KS {d.scores.ks.toFixed(2)}</span>
            <span>Cos {d.scores.cosine.toFixed(2)}</span>
          </span>
        )}
      </span>
    ),
  },
  {
    label: "Contexts",
    term: "contexts",
    metric: (d) => d.n_contexts,
    value: (d, best) => <span className={num(best)}>{d.n_contexts}</span>,
  },
  {
    label: "Cell lines",
    metric: (d) => cellLines(d).length,
    value: (d, best) => (
      <span className="flex items-baseline gap-2.5">
        <span className={cn(num(best), "min-w-4 shrink-0")}>{cellLines(d).length}</span>
        <Values values={cellLines(d)} />
      </span>
    ),
  },
  { label: "Doses", value: (d) => <Values values={d.gaps.doses_um} unit="µM" /> },
  { label: "Times", value: (d) => <Values values={d.gaps.times_h} unit="h" /> },
  {
    label: "Brain-cell data",
    term: "brainCells",
    metric: (d) => brainCells(d).length,
    value: (d) => {
      const cells = brainCells(d);
      if (!cells.length) return <span className="text-ink-3">none</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {cells.slice(0, 3).map((c, i) => (
            <StatusBadge key={`${c.cell_id}-${i}`} tone="ok" size="sm" className="font-mono">
              <BrainIcon aria-hidden />
              {`${c.cell_id} ${c.consensus.toFixed(2)}`}
            </StatusBadge>
          ))}
          {cells.length > 3 && <span className="font-mono text-[11px] text-ink-3">+{cells.length - 3}</span>}
        </span>
      );
    },
  },
  {
    label: "Brain exposure",
    term: "exposure",
    value: (d) => (
      <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
        <span className={cn("size-[7px] shrink-0 rounded-full", exposureTone(d.gaps.exposure.label))} />
        {exposureText(d)}
      </span>
    ),
  },
  {
    label: "Targets",
    value: (d) => <Values values={uniq((d.targets ?? []).map((t) => t.symbol))} empty="None recorded" max={6} />,
  },
  {
    label: "Hidden tests",
    term: "hiddenTests",
    value: (d) => (
      <span className="flex items-center gap-2">
        <span className="font-mono text-ink tabular-nums">{d.n_hidden_tests ?? unspecified}</span>
        {d.attack_ready ? (
          <Term term="attackReady" className="text-[12px] text-ink-3">Attack-ready</Term>
        ) : (
          <Term term="attackReady" className="no-underline">
            <StatusBadge size="sm">Not attack-ready</StatusBadge>
          </Term>
        )}
      </span>
    ),
  },
  {
    label: "Approval",
    term: "approval",
    value: (d) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge size="sm" className={cn(d.approval_status?.status !== "approved" && "text-ink-3")}>
          {d.approval_status?.status === "approved" && <SealCheckIcon className="text-ok" aria-hidden />}
          {sentence(d.approval_status?.status ?? unspecified)}
        </StatusBadge>
        <WithdrawnBadge approval={d.approval_status} size="sm" />
      </span>
    ),
  },
];

/** Rows are grouped into soft tinted blocks instead of ruled lines. */
const GROUPS: { label: string; icon: Icon; rows: string[] }[] = [
  { label: "Signal", icon: ChartLineDownIcon, rows: ["Reversal", "Contexts", "Cell lines", "Doses", "Times"] },
  { label: "Brain", icon: BrainIcon, rows: ["Brain-cell data", "Brain exposure"] },
  { label: "Evidence", icon: ListChecksIcon, rows: ["Targets", "Hidden tests", "Approval"] },
];
const LABEL_COL = 160;
const block =
  "[&>tr:nth-child(2)>*:first-child]:rounded-tl-xl [&>tr:nth-child(2)>*:last-child]:rounded-tr-xl [&>tr:last-child>*:first-child]:rounded-bl-xl [&>tr:last-child>*:last-child]:rounded-br-xl";
const skel = "bg-ink/[0.06]";

/** Indices of the best value in a row, only when values differ. */
function bestOf(row: Row, entries: Entry[]): Set<number> {
  if (!row.metric) return new Set();
  const vals = entries.map((e) => (e.detail ? row.metric!(e.detail) : Number.NaN));
  const known = vals.filter((v) => !Number.isNaN(v));
  if (known.length < 2 || new Set(known).size < 2) return new Set();
  const top = Math.max(...known);
  return new Set(vals.flatMap((v, i) => (v === top ? [i] : [])));
}

export function CompareView({ drugIds, projectId }: CompareViewProps) {
  const ids = [...new Set(drugIds)];
  const valid = ids.length >= 2 && ids.length <= 4;
  const key = JSON.stringify([ids, projectId]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const { toggleCompare, setStep, selectCandidate } = useUi();
  useEffect(() => {
    const controller = new AbortController();
    if (valid) {
      const [selected] = JSON.parse(key) as [string[], string | undefined];
      Promise.all(
        selected.map(async (id) => {
          try {
            const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
            const response = await fetch(`/api/drugs/${encodeURIComponent(id)}${query}`, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("Drug unavailable");
            return { id, detail: (await response.json()) as Detail };
          } catch {
            return { id, error: true };
          }
        }),
      ).then((values) => {
        if (!controller.signal.aborted) {
          setEntries(values);
          setLoadedKey(key);
        }
      });
    }
    return () => controller.abort();
  }, [key, valid, projectId]);

  const choose = (
    <Button variant="outline" size="lg" onClick={() => setStep("candidates")}>
      <RowsIcon /> Choose candidates
    </Button>
  );
  if (!valid)
    return (
      <div className="p-6">
        <EmptyState
          className="rounded-[18px] border-solid border-white/80 bg-white/75 shadow-[0_1px_2px_rgb(15_24_48/0.05),0_20px_48px_-18px_rgb(30_60_140/0.28)] backdrop-blur-xl"
          icon={
            <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-primary">
              <ColumnsIcon className="size-5" />
            </span>
          }
          title="Choose 2 to 4 candidates"
          action={choose}
        />
      </div>
    );

  const visible = loadedKey === key ? entries : ids.map((id) => ({ id }) as Entry);
  const best = ROWS.map((row) => bestOf(row, visible));
  const strongest = bestOf({ label: "", metric: (d) => -d.consensus, value: () => null }, visible);
  const total = visible.find((e) => e.detail?.rank_total)?.detail?.rank_total;
  const cols = visible.length + 1;

  return (
    <section className="px-6 pb-6" aria-label="Compare compounds" style={{ maxWidth: 48 + LABEL_COL + ids.length * 320 }}>
      <Toolbar className="mb-0 h-14">
        <span className="inline-flex h-8 items-center gap-2 rounded-full bg-white/60 pr-3 pl-1 ring-1 ring-white/80">
          <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-primary">
            <ColumnsIcon className="size-3.5" aria-hidden />
          </span>
          <span className="font-mono text-[12px] text-ink-2 tabular-nums">{ids.length}/4</span>
        </span>
        <Button
          variant="outline"
          size="lg"
          className="ml-auto"
          onClick={() => setStep("candidates")}
          disabled={ids.length >= 4}
        >
          <PlusIcon /> Add
        </Button>
      </Toolbar>
      <div className="glass overflow-x-auto p-2">
        <table
          aria-label="Compare candidates"
          className="w-full table-fixed border-separate border-spacing-0 text-[13.5px]"
          style={{ minWidth: 112 + ids.length * 200 }}
        >
          <colgroup>
            <col className="w-28 sm:w-40" />
            {visible.map((e) => (
              <col key={e.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="p-1 text-left align-bottom">
                <span className="sr-only">Evidence</span>
              </th>
              {visible.map((entry, i) => {
                const d = entry.detail;
                const top = strongest.has(i);
                return (
                  <th scope="col" key={entry.id} className="h-px p-1 text-left align-top font-normal">
                    <div
                      className={cn(
                        "relative flex h-full flex-col rounded-[14px] px-4 pt-3.5 pb-4 ring-1 backdrop-blur",
                        top
                          ? "bg-gradient-to-b from-primary/[0.09] to-primary/[0.03] ring-primary/20"
                          : "bg-white/70 ring-ink/[0.06]",
                      )}
                    >
                      <div className="flex min-h-7 items-center gap-2 pr-7">
                        {d ? (
                          <button
                            type="button"
                            className="min-w-0 truncate rounded-sm text-left font-heading text-[15px] font-medium tracking-[-0.01em] text-ink outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                            onClick={() => {
                              selectCandidate(entry.id);
                              setStep("evidence");
                            }}
                          >
                            {d.name}
                          </button>
                        ) : entry.error ? (
                          <span className="truncate font-mono text-[13px] text-ink-2">{entry.id}</span>
                        ) : (
                          <Skeleton className={cn("h-4 w-28", skel)} />
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-3 right-2.5 rounded-full text-ink-3 hover:bg-primary/8 hover:text-primary"
                        aria-label={`Remove ${d?.name ?? entry.id}`}
                        onClick={() => toggleCompare(entry.id)}
                      >
                        <XIcon />
                      </Button>
                      {d ? (
                        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                          <div>
                            <div
                              className={cn(
                                "font-mono text-[34px] leading-none font-normal tracking-[-0.04em] tabular-nums",
                                top ? "text-primary" : "text-ink",
                              )}
                            >
                              {d.consensus.toFixed(2)}
                            </div>
                            <div className="mt-2 font-mono text-[11.5px] text-ink-3 tabular-nums">
                              <Term term="poolRank">
                                #{d.pool_rank ?? unspecified}
                                {total ? ` of ${total.toLocaleString("en-US")}` : ""}
                              </Term>
                            </div>
                          </div>
                          {!d.preregistered && (
                            <StatusBadge tone="gap" size="sm">
                              <WarningCircleIcon aria-hidden />
                              not preregistered
                            </StatusBadge>
                          )}
                        </div>
                      ) : entry.error ? (
                        <div className="mt-3">
                          <StatusBadge tone="bad">
                            <WarningCircleIcon aria-hidden />
                            Unavailable
                          </StatusBadge>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <Skeleton className={cn("h-8 w-24", skel)} />
                          <Skeleton className={cn("h-3 w-16", skel)} />
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          {GROUPS.map((group) => (
            <tbody key={group.label} className={block}>
              <tr>
                <td colSpan={cols} className="px-3 pt-4 pb-2">
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
                    <group.icon className="size-3.5 text-primary" aria-hidden />
                    {group.label}
                  </span>
                </td>
              </tr>
              {group.rows.map((label) => {
                const r = ROWS.findIndex((row) => row.label === label);
                const row = ROWS[r];
                return (
                  <tr key={row.label} className="group">
                    <th
                      scope="row"
                      className="bg-ink/[0.03] px-3 py-2.5 text-left align-top text-[12px] font-normal text-ink-3 transition-colors group-hover:bg-primary/[0.06]"
                    >
                      {row.term ? <Term term={row.term}>{row.label}</Term> : row.label}
                    </th>
                    {visible.map((entry, i) => (
                      <td
                        key={entry.id}
                        className="min-h-10 bg-ink/[0.03] px-4 py-2.5 align-top transition-colors group-hover:bg-primary/[0.06]"
                      >
                        {entry.detail ? (
                          row.value(entry.detail, best[r].has(i))
                        ) : entry.error ? null : (
                          <Skeleton className={cn("h-3 w-20", skel)} />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
export default CompareView;
