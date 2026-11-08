import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowsInIcon,
  ArrowUpIcon,
  BrainIcon,
  ColumnsIcon,
  FlaskIcon,
  FunnelSimpleXIcon,
  RowsIcon,
  SealCheckIcon,
  StackIcon,
  WarningCircleIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import { useProjectCandidates, type CandidateFilters } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import {
  EmptyState,
  GLOSSARY,
  StatusBadge,
  Term,
  Toolbar,
  WithdrawnBadge,
  type GlossaryKey,
} from "@/components/system";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUi } from "@/store/ui";
import { ReversalBar } from "./ReversalBar";
import {
  API_MAX,
  DEFAULT_SORT,
  FIRST_DIR,
  PAGE,
  isNotScreened,
  sortCandidates,
  type Sort,
  type SortKey,
} from "./sorting";
import { exposureTone, isNeural, sentence } from "./format";
import { CHECKBOX, FILTER_PILL, SEL_CELL, SEL_FIRST, SEL_LAST } from "./styles";

type Candidate = Schema<"ProjectCandidate">;
type FilterKey = "approved" | "brain_cells" | "penetrant" | "min_contexts";

const FILTERS: [FilterKey, string, Icon][] = [
  ["approved", "Approved", SealCheckIcon],
  ["brain_cells", "Brain-cell data", BrainIcon],
  ["penetrant", "Brain-penetrant", ArrowsInIcon],
  ["min_contexts", "≥ 5 contexts", StackIcon],
];
const MAX_COMPARE = 4;
const COLUMNS = 8;
function toFilters(keys: FilterKey[]): CandidateFilters {
  const next: CandidateFilters = {};
  for (const key of keys) {
    if (key === "min_contexts") next.min_contexts = 5;
    else next[key] = true;
  }
  return next;
}

const head =
  "h-10 px-3 text-left align-middle text-[11.5px] font-medium whitespace-nowrap text-ink-3 transition-colors";
const cell = "h-11 px-3 py-0 align-middle whitespace-nowrap";
const skel = "bg-ink/[0.06]";

/** True once the table header has stuck under the filter bar, so it can pick up a frosted fill. */
function useStuck() {
  const table = useRef<HTMLTableElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const raf = { id: 0 };
    const check = () => {
      raf.id = 0;
      const t = table.current;
      const h = t?.tHead;
      if (!t || !h) return;
      setStuck(h.getBoundingClientRect().top - t.getBoundingClientRect().top > 1);
    };
    const onScroll = () => {
      if (!raf.id) raf.id = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (raf.id) cancelAnimationFrame(raf.id);
    };
  }, []);
  return [table, stuck] as const;
}

export function RepurposingView({
  projectId = "GSE132903",
}: { projectId?: string } = {}) {
  const [keys, setKeys] = useState<FilterKey[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const filters = { ...toFilters(keys), limit };
  const query = useProjectCandidates(projectId, filters);
  const { error, refetch, isFetching } = query;
  // Keep the previous page on screen while a larger page for the same filters loads.
  const base = `${projectId}|${keys.join(",")}`;
  const [kept, setKept] = useState<{ base: string; data: NonNullable<typeof query.data> } | null>(null);
  if (query.data && kept?.data !== query.data) setKept({ base, data: query.data });
  const data =
    query.data ?? (kept?.base === base && query.isPending ? kept.data : undefined);
  const isPending = query.isPending && !data;
  const isError = query.isError;
  const notScreened = isNotScreened(data, error);
  const rows = useMemo(
    () => (data ? sortCandidates(data.candidates, sort) : []),
    [data, sort],
  );
  const eligible = data ? (data.n_total_eligible ?? data.n_ranked) : 0;
  const hasMore = !!data && data.candidates.length < eligible && limit < API_MAX;
  function onSort(key: SortKey) {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: FIRST_DIR[key] },
    );
  }
  function setFilterKeys(next: FilterKey[]) {
    setKeys(next);
    setLimit(PAGE);
  }
  const mock = useMockStatus();
  const {
    selectCandidate,
    selectedCandidateId,
    setStep,
    compareIds,
    toggleCompare,
  } = useUi();
  const reduce = useReducedMotion();
  const [tableRef, stuck] = useStuck();
  const [names, setNames] = useState<Record<string, string>>({});

  function open(id: string) {
    selectCandidate(id);
    setStep("evidence");
  }
  function toggle(c: Candidate) {
    setNames((n) => ({ ...n, [c.id]: c.name }));
    toggleCompare(c.id);
  }
  function clearCompare() {
    for (const id of compareIds) toggleCompare(id);
  }
  const nameOf = (id: string) =>
    names[id] ?? data?.candidates.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="relative flex min-h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mock} />
      <div className="flex-1 px-6 pb-6">
        <Toolbar className="sticky top-0 z-20 -mx-6 mb-0 min-h-14 flex-wrap gap-y-2 bg-[rgb(233_238_248/0.88)] px-6 py-2.5 backdrop-blur-xl lg:h-14 lg:flex-nowrap lg:py-0">
          <ToggleGroup
            multiple
            value={keys}
            onValueChange={(v) => setFilterKeys(v as FilterKey[])}
            spacing={1.5}
            aria-label="Filters"
            className="max-w-full flex-wrap gap-y-1.5"
          >
            {FILTERS.map(([key, label, FilterIcon]) => (
              <ToggleGroupItem key={key} value={key} className={FILTER_PILL}>
                <FilterIcon weight={keys.includes(key) ? "fill" : "regular"} aria-hidden />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {data && !data.preregistered && (
            <StatusBadge tone="gap">
              <WarningCircleIcon aria-hidden />
              not preregistered
            </StatusBadge>
          )}
          <span
            role="status"
            className="ml-auto font-mono text-[12px] whitespace-nowrap text-ink-3 tabular-nums"
          >
            {notScreened
              ? ""
              : data
                ? `Showing ${data.candidates.length.toLocaleString("en-US")} of ${eligible.toLocaleString("en-US")}`
                : isError
                  ? ""
                  : "Loading"}
          </span>
          {data && !notScreened && keys.length > 0 && (
            <span className="rounded-full bg-white/60 px-2.5 py-1 font-mono text-[11.5px] whitespace-nowrap text-ink-3 tabular-nums ring-1 ring-white/80">
              {`${(data.n_ranked ?? 0).toLocaleString("en-US")} ranked`}
            </span>
          )}
        </Toolbar>

        {notScreened ? (
          <EmptyState
            className="mt-2"
            icon={<FlaskIcon />}
            title="Not screened"
            action={
              <Button size="lg" onClick={() => setStep("screen")}>
                Run screen
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            }
          />
        ) : isError ? (
          <div
            role="alert"
            className="glass mt-2 flex h-40 items-center justify-center gap-3 text-[13.5px] text-ink-2"
          >
            <WarningCircleIcon className="size-5 text-bad" aria-hidden />
            Candidates unavailable
            <Button variant="outline" size="lg" onClick={() => void refetch()}>
              <ArrowClockwiseIcon /> Retry
            </Button>
          </div>
        ) : (
          <div className="glass mt-1 p-2 max-lg:overflow-x-auto">
            <table
              ref={tableRef}
              data-slot="table"
              aria-label="Candidates"
              aria-busy={isPending || undefined}
              className="w-full border-separate border-spacing-0 text-[13.5px]"
            >
              {/* Below lg the panel scrolls sideways and becomes the sticky container, so the toolbar offset must not apply. */}
              <thead
                data-stuck={stuck || undefined}
                className="sticky top-0 z-10 lg:top-14 [&_th:first-child]:rounded-l-xl [&_th:last-child]:rounded-r-xl data-stuck:[&_th]:bg-[rgb(251_252_254/0.985)] data-stuck:[&_th]:backdrop-blur-xl"
              >
                <tr>
                  <th className={cn(head, "w-11 pl-3")}>
                    <span className="sr-only">Compare</span>
                  </th>
                  <SortHead k="rank" sort={sort} onSort={onSort} className="w-14 text-right" align="right" tip="poolRank">#</SortHead>
                  <SortHead k="name" sort={sort} onSort={onSort}>Drug</SortHead>
                  <SortHead k="reversal" sort={sort} onSort={onSort} className="w-24 xl:w-36 2xl:w-44" tip="reversal">Reversal</SortHead>
                  <SortHead k="contexts" sort={sort} onSort={onSort} className="hidden w-20 text-right xl:table-cell" align="right" tip="contexts">Contexts</SortHead>
                  <th className={cn(head, "hidden w-32 xl:table-cell")}><Term term="brainCells">Brain cells</Term></th>
                  <th className={cn(head, "w-40 2xl:w-44")}><Term term="exposure">Exposure</Term></th>
                  <th className={cn(head, "w-60 pr-3 xl:w-36 2xl:w-60")}><Term term="approval">Approval</Term></th>
                </tr>
              </thead>
              <tbody>
                {isPending &&
                  Array.from({ length: 12 }, (_, i) => (
                    <tr key={i}>
                      <td className={cn(cell, "pl-3")}><Skeleton className={cn("size-[18px] rounded-[6px]", skel)} /></td>
                      <td className={cell}><Skeleton className={cn("ml-auto h-3 w-5", skel)} /></td>
                      <td className={cell}><Skeleton className={cn("h-3 w-32", skel)} /></td>
                      <td className={cell}><Skeleton className={cn("h-3 w-28", skel)} /></td>
                      <td className={cn(cell, "hidden xl:table-cell")}><Skeleton className={cn("ml-auto h-3 w-5", skel)} /></td>
                      <td className={cn(cell, "hidden xl:table-cell")}><Skeleton className={cn("h-5 w-20 rounded-full", skel)} /></td>
                      <td className={cell}><Skeleton className={cn("h-3 w-28", skel)} /></td>
                      <td className={cn(cell, "pr-3")}><Skeleton className={cn("h-5 w-16 rounded-full", skel)} /></td>
                    </tr>
                  ))}
                {rows.map((c) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    selected={c.id === selectedCandidateId}
                    compared={compareIds.includes(c.id)}
                    compareFull={compareIds.length >= MAX_COMPARE}
                    onOpen={() => open(c.id)}
                    onToggle={() => toggle(c)}
                  />
                ))}
                {data && data.candidates.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-primary">
                          <FunnelSimpleXIcon className="size-5" aria-hidden />
                        </span>
                        <span className="text-[14px] font-medium text-ink-2">
                          No candidates
                        </span>
                        <Button variant="outline" size="lg" onClick={() => setFilterKeys([])}>
                          <FunnelSimpleXIcon /> Clear filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {hasMore && (
              <div className="flex flex-wrap items-center justify-center gap-2 px-4 pt-3 pb-2">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={isFetching}
                  onClick={() => setLimit((l) => Math.min(API_MAX, l + PAGE * 4))}
                >
                  <ArrowDownIcon />
                  Load {Math.min(PAGE * 4, eligible - data!.candidates.length).toLocaleString("en-US")} more
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  disabled={isFetching}
                  onClick={() => setLimit(Math.min(API_MAX, eligible))}
                >
                  <RowsIcon />
                  Show all {eligible.toLocaleString("en-US")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {compareIds.length > 0 && (
          <motion.div
            key="compare-bar"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="glass sticky bottom-4 z-30 mx-auto mb-4 flex w-fit max-w-[calc(100%-48px)] items-center gap-2 rounded-full! py-1.5 pr-1.5 pl-2 sm:gap-3"
            role="region"
            aria-label="Compare selection"
          >
            <span className="grid h-7 shrink-0 place-items-center rounded-full bg-primary/10 px-2.5 font-mono text-[12px] font-medium text-primary tabular-nums">
              {compareIds.length}/{MAX_COMPARE}
            </span>
            <span className="max-w-[420px] min-w-0 truncate text-[13px] text-ink-2 max-sm:hidden">
              {compareIds.map(nameOf).join(", ")}
            </span>
            <Button
              variant="ghost"
              size="lg"
              className="rounded-full px-3 hover:bg-primary/8"
              onClick={clearCompare}
              aria-label="Clear compare"
            >
              <XIcon /> Clear
            </Button>
            <Button
              size="lg"
              className="px-3.5"
              disabled={compareIds.length < 2}
              onClick={() => setStep("compare")}
            >
              <ColumnsIcon />
              Compare {compareIds.length}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SortHead({
  k,
  sort,
  onSort,
  tip,
  align = "left",
  className,
  children,
}: {
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  tip?: GlossaryKey;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = sort.key === k;
  const Arrow = sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  const button = (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={cn(
        "inline-flex items-center gap-1 rounded-full outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40",
        align === "right" && "flex-row-reverse",
        active && "text-ink",
        tip && "underline decoration-ink/20 decoration-dotted underline-offset-[3px]",
      )}
    />
  );
  const inner = (
    <>
      {children}
      <Arrow className={cn("size-3 text-primary", !active && "invisible")} weight="bold" aria-hidden />
    </>
  );
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(head, className)}
    >
      {tip ? (
        <Tooltip>
          <TooltipTrigger render={button}>{inner}</TooltipTrigger>
          <TooltipContent className="max-w-72 text-left leading-snug">{GLOSSARY[tip]}</TooltipContent>
        </Tooltip>
      ) : (
        <button {...button.props}>{inner}</button>
      )}
    </th>
  );
}

function CandidateRow({
  c,
  selected,
  compared,
  compareFull,
  onOpen,
  onToggle,
}: {
  c: Candidate;
  selected: boolean;
  compared: boolean;
  compareFull: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const neural = c.by_cell_line.filter((x) => isNeural(x.cell_id));
  const approval = c.approval_status?.status;
  const exposure = c.exposure_label ?? "unspecified";
  // Rows are rounded tiles: the tint and ring live on the cells so they follow the 12px radius.
  const td = cn(
    cell,
    "transition-colors first:rounded-l-xl last:rounded-r-xl",
    selected ? SEL_CELL : compared ? "bg-primary/[0.04] group-hover:bg-primary/[0.08]" : "group-hover:bg-primary/[0.06]",
    selected && "group-hover:bg-primary/[0.13]",
  );
  return (
    <tr
      data-state={selected ? "selected" : undefined}
      aria-selected={selected}
      onClick={onOpen}
      className="group cursor-pointer"
    >
      <td
        className={cn(td, "pl-3", selected && SEL_FIRST)}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          aria-label={`Compare ${c.name}`}
          checked={compared}
          disabled={!compared && compareFull}
          onCheckedChange={onToggle}
          className={CHECKBOX}
        />
      </td>
      <td className={cn(td, "text-right font-mono text-[12.5px] text-ink-3 tabular-nums", selected && "text-primary")}>
        {c.rank}
      </td>
      <td className={cn(td, "max-w-[340px]")}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="truncate rounded-sm text-left font-medium text-ink outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {c.name}
          </button>
          {c.preregistered === false && (
            <StatusBadge tone="gap" size="sm">
              <WarningCircleIcon aria-hidden />
              not preregistered
            </StatusBadge>
          )}
        </div>
      </td>
      <td className={td}>
        <div className="flex items-center gap-3" aria-label={`Reversal ${c.consensus.toFixed(2)}`}>
          <span className="w-11 text-right font-mono text-[13px] font-medium text-ink tabular-nums">
            {c.consensus.toFixed(2)}
          </span>
          <span className="hidden xl:block"><ReversalBar score={c.consensus} className="w-20 2xl:w-28" /></span>
        </div>
      </td>
      <td className={cn(td, "hidden text-right font-mono text-[13px] text-ink-2 tabular-nums xl:table-cell")}>
        {c.n_ranking_contexts}
      </td>
      <td className={cn(td, "hidden xl:table-cell")}>
        {c.brain_cells ? (
          <div className="flex items-center gap-1">
            {neural.length ? (
              <>
                {neural.slice(0, 1).map((x) => (
                  <StatusBadge key={x.cell_id} tone="ok" size="sm" className="font-mono">
                    <BrainIcon aria-hidden />
                    {`${x.cell_id} ${x.consensus.toFixed(2)}`}
                  </StatusBadge>
                ))}
                {neural.length > 1 && (
                  <span className="font-mono text-[11px] text-ink-3">+{neural.length - 1}</span>
                )}
              </>
            ) : (
              <StatusBadge tone="ok" size="sm">
                <BrainIcon aria-hidden /> Neural
              </StatusBadge>
            )}
          </div>
        ) : (
          <span className="sr-only">None</span>
        )}
      </td>
      <td className={td}>
        <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          <span className={cn("size-[7px] shrink-0 rounded-full", exposureTone(c.exposure_label, c.penetrant))} />
          {exposure}
        </span>
      </td>
      <td className={cn(td, "pr-3", selected && SEL_LAST)}>
        <div className="flex items-center gap-1.5 py-1.5 xl:flex-wrap xl:gap-1 2xl:flex-nowrap 2xl:gap-1.5">
          <StatusBadge size="sm" className={cn(approval !== "approved" && "text-ink-3")}>
            {approval === "approved" && <SealCheckIcon className="text-ok" aria-hidden />}
            {sentence(approval ?? "unspecified")}
          </StatusBadge>
          <WithdrawnBadge approval={c.approval_status} size="sm" />
        </div>
      </td>
    </tr>
  );
}
