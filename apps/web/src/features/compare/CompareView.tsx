import { useEffect, useState, type ReactNode } from "react";
import { ColumnsIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { Schema } from "@/api/types";
import { EmptyState, StatusBadge, Toolbar } from "@/components/system";
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
  /** Higher is better; omit for rows that are not ranked. */
  metric?: (d: Detail) => number;
  value: (d: Detail, best: boolean) => ReactNode;
};

const num = (best: boolean) =>
  cn("font-mono tabular-nums", best ? "font-medium text-primary" : "text-ink");

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
    metric: (d) => d.n_contexts,
    value: (d, best) => <span className={num(best)}>{d.n_contexts}</span>,
  },
  {
    label: "Cell lines",
    metric: (d) => cellLines(d).length,
    value: (d, best) => (
      <span className="flex items-baseline gap-2.5">
        <span className={cn(num(best), "w-4 shrink-0")}>{cellLines(d).length}</span>
        <Values values={cellLines(d)} />
      </span>
    ),
  },
  { label: "Doses", value: (d) => <Values values={d.gaps.doses_um} unit="µM" /> },
  { label: "Times", value: (d) => <Values values={d.gaps.times_h} unit="h" /> },
  {
    label: "Brain-cell data",
    metric: (d) => brainCells(d).length,
    value: (d) => {
      const cells = brainCells(d);
      if (!cells.length) return <span className="text-ink-3">none</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {cells.slice(0, 3).map((c, i) => (
            <StatusBadge key={`${c.cell_id}-${i}`} tone="ok" className="h-5 px-1.5 font-mono text-[11px]">
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
    value: (d) => (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", exposureTone(d.gaps.exposure.label))} />
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
    value: (d) => (
      <span className="flex items-center gap-2">
        <span className="font-mono text-ink tabular-nums">{d.n_hidden_tests ?? unspecified}</span>
        {!d.attack_ready && <StatusBadge className="h-5 px-1.5 text-[11px]">Not ready</StatusBadge>}
      </span>
    ),
  },
  {
    label: "Approval",
    value: (d) => <span className="text-[13px] text-ink-2">{sentence(d.approval_status?.status ?? unspecified)}</span>,
  },
];

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
      Choose candidates
    </Button>
  );
  if (!valid)
    return (
      <div className="p-6">
        <EmptyState icon={<ColumnsIcon />} title="Choose 2 to 4 candidates" action={choose} />
      </div>
    );

  const visible = loadedKey === key ? entries : ids.map((id) => ({ id }) as Entry);
  const best = ROWS.map((row) => bestOf(row, visible));
  const strongest = bestOf({ label: "", metric: (d) => -d.consensus, value: () => null }, visible);
  const total = visible.find((e) => e.detail?.rank_total)?.detail?.rank_total;

  return (
    <section className="px-6 pb-6" aria-label="Compare compounds" style={{ maxWidth: 48 + 152 + ids.length * 320 }}>
      <Toolbar className="mb-0 h-14">
        <span className="font-mono text-[12.5px] text-ink-3 tabular-nums">{ids.length}/4</span>
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
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table
          aria-label="Compare candidates"
          className="w-full table-fixed border-separate border-spacing-0 text-[13.5px]"
          style={{ minWidth: 152 + ids.length * 200 }}
        >
          <colgroup>
            <col style={{ width: 152 }} />
            {visible.map((e) => (
              <col key={e.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-4 py-4 text-left align-bottom">
                <span className="sr-only">Evidence</span>
              </th>
              {visible.map((entry, i) => {
                const d = entry.detail;
                return (
                  <th
                    scope="col"
                    key={entry.id}
                    className={cn(
                      "group/col relative border-b border-line px-4 pt-4 pb-4 text-left align-top font-normal",
                      i > 0 && "border-l border-l-line",
                    )}
                  >
                    <div className="flex items-start gap-2 pr-6">
                      {d ? (
                        <button
                          type="button"
                          className="min-w-0 truncate rounded-sm text-left font-heading text-[15px] font-semibold tracking-tight text-ink outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
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
                        <Skeleton className="mt-1 h-4 w-28 bg-line/70" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-3.5 right-3 text-ink-3 hover:text-ink"
                      aria-label={`Remove ${d?.name ?? entry.id}`}
                      onClick={() => toggleCompare(entry.id)}
                    >
                      <XIcon />
                    </Button>
                    {d ? (
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                          <div
                            className={cn(
                              "font-mono text-[28px] leading-none font-medium tracking-tight tabular-nums",
                              strongest.has(i) ? "text-primary" : "text-ink",
                            )}
                          >
                            {d.consensus.toFixed(2)}
                          </div>
                          <div className="mt-1.5 font-mono text-[11.5px] text-ink-3 tabular-nums">
                            #{d.pool_rank ?? unspecified}
                            {total ? ` of ${total.toLocaleString("en-US")}` : ""}
                          </div>
                        </div>
                        {!d.preregistered && (
                          <StatusBadge tone="gap" className="h-5 px-1.5 text-[11px]">
                            not preregistered
                          </StatusBadge>
                        )}
                      </div>
                    ) : entry.error ? (
                      <div className="mt-3">
                        <StatusBadge tone="bad">Unavailable</StatusBadge>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-7 w-20 bg-line/70" />
                        <Skeleton className="h-3 w-16 bg-line/70" />
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, r) => (
              <tr key={row.label} className="hover:bg-surface-2/60">
                <th
                  scope="row"
                  className={cn(
                    "px-4 py-2.5 text-left align-top text-[12px] font-normal text-ink-3",
                    r < ROWS.length - 1 && "border-b border-line",
                  )}
                >
                  {row.label}
                </th>
                {visible.map((entry, i) => (
                  <td
                    key={entry.id}
                    className={cn(
                      "min-h-10 px-4 py-2.5 align-top",
                      r < ROWS.length - 1 && "border-b border-line",
                      i > 0 && "border-l border-l-line",
                    )}
                  >
                    {entry.detail ? (
                      row.value(entry.detail, best[r].has(i))
                    ) : entry.error ? null : (
                      <Skeleton className="h-3 w-20 bg-line/70" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export default CompareView;
