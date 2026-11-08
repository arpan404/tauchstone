import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BrainIcon,
  FlaskIcon,
  FunnelSimpleXIcon,
  XIcon,
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
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type Candidate = Schema<"ProjectCandidate">;
type FilterKey = "approved" | "brain_cells" | "penetrant" | "min_contexts";

const FILTERS: [FilterKey, string][] = [
  ["approved", "Approved"],
  ["brain_cells", "Brain-cell data"],
  ["penetrant", "Brain-penetrant"],
  ["min_contexts", "≥ 5 contexts"],
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

const head = "h-9 px-3 text-[12px] font-medium text-ink-3 bg-surface-2";
const cell = "h-10 px-3 py-0";

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
        <Toolbar className="sticky top-0 z-20 mb-0 min-h-14 flex-wrap gap-y-2 bg-[rgb(233_238_248/0.88)] py-2 backdrop-blur-xl lg:h-14 lg:flex-nowrap lg:py-0">
          <ToggleGroup
            multiple
            value={keys}
            onValueChange={(v) => setFilterKeys(v as FilterKey[])}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Filters"
            className="max-w-full overflow-x-auto bg-surface"
          >
            {FILTERS.map(([key, label]) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="h-8 px-3 text-[13px] text-ink-2 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {data && !data.preregistered && (
            <StatusBadge tone="gap">not preregistered</StatusBadge>
          )}
          <span
            role="status"
            className="ml-auto font-mono text-[12.5px] whitespace-nowrap text-ink-3 tabular-nums"
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
            <span className="font-mono text-[12px] whitespace-nowrap text-ink-3 tabular-nums">
              {`${(data.n_ranked ?? 0).toLocaleString("en-US")} ranked`}
            </span>
          )}
        </Toolbar>

        {notScreened ? (
          <EmptyState
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
            className="flex h-40 items-center justify-center gap-3 rounded-lg border border-line bg-surface text-[13.5px] text-ink-2"
          >
            Candidates unavailable
            <Button variant="outline" size="lg" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-line bg-surface max-lg:overflow-x-auto">
            <table
              data-slot="table"
              aria-label="Candidates"
              aria-busy={isPending || undefined}
              className="w-full border-separate border-spacing-0 text-[13.5px]"
            >
              {/* Below lg the panel scrolls sideways and becomes the sticky container, so the toolbar offset must not apply. */}
              <TableHeader className="sticky top-0 z-10 lg:top-14 [&_tr]:border-0 [&_th]:border-b [&_th]:border-line">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(head, "w-11 rounded-tl-lg pl-4")}>
                    <span className="sr-only">Compare</span>
                  </TableHead>
                  <SortHead k="rank" sort={sort} onSort={onSort} className="w-14 text-right" align="right" tip="poolRank">#</SortHead>
                  <SortHead k="name" sort={sort} onSort={onSort}>Drug</SortHead>
                  <SortHead k="reversal" sort={sort} onSort={onSort} className="w-24 xl:w-44" tip="reversal">Reversal</SortHead>
                  <SortHead k="contexts" sort={sort} onSort={onSort} className="hidden w-24 text-right xl:table-cell" align="right" tip="contexts">Contexts</SortHead>
                  <TableHead className={cn(head, "hidden w-32 xl:table-cell")}><Term term="brainCells">Brain cells</Term></TableHead>
                  <TableHead className={cn(head, "w-40")}><Term term="exposure">Exposure</Term></TableHead>
                  <TableHead className={cn(head, "w-32 rounded-tr-lg pr-4 2xl:w-48")}><Term term="approval">Approval</Term></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_td]:border-b [&_td]:border-line [&_tr:last-child_td]:border-0">
                {isPending &&
                  Array.from({ length: 12 }, (_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell className={cn(cell, "pl-4")}><Skeleton className="size-4 rounded-[4px] bg-line/70" /></TableCell>
                      <TableCell className={cell}><Skeleton className="ml-auto h-3 w-5 bg-line/70" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-3 w-32 bg-line/70" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-3 w-28 bg-line/70" /></TableCell>
                      <TableCell className={cn(cell, "hidden xl:table-cell")}><Skeleton className="ml-auto h-3 w-5 bg-line/70" /></TableCell>
                      <TableCell className={cn(cell, "hidden xl:table-cell")}><Skeleton className="h-5 w-20 bg-line/70" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-28 bg-line/70" /></TableCell>
                      <TableCell className={cn(cell, "pr-4")}><Skeleton className="h-5 w-16 bg-line/70" /></TableCell>
                    </TableRow>
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
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMNS} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-[14px] font-medium text-ink-2">
                          No candidates
                        </span>
                        <Button variant="outline" size="lg" onClick={() => setFilterKeys([])}>
                          <FunnelSimpleXIcon /> Clear filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
            {hasMore && (
              <div className="flex items-center justify-center gap-2 border-t border-line px-4 py-3">
                <Button
                  variant="outline"
                  size="lg"
                  disabled={isFetching}
                  onClick={() => setLimit((l) => Math.min(API_MAX, l + PAGE * 4))}
                >
                  Load {Math.min(PAGE * 4, eligible - data!.candidates.length).toLocaleString("en-US")} more
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  disabled={isFetching}
                  onClick={() => setLimit(Math.min(API_MAX, eligible))}
                >
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
            className="sticky bottom-4 z-30 mx-auto mb-4 flex w-fit max-w-[calc(100%-48px)] items-center gap-3 rounded-lg border border-line bg-surface py-2 pr-2 pl-4 shadow-overlay"
            role="region"
            aria-label="Compare selection"
          >
            <span className="font-mono text-[12px] text-ink-3 tabular-nums">
              {compareIds.length}/{MAX_COMPARE}
            </span>
            <span className="max-w-[420px] truncate text-[13px] text-ink-2">
              {compareIds.map(nameOf).join(", ")}
            </span>
            <Button variant="ghost" size="lg" onClick={clearCompare} aria-label="Clear compare">
              <XIcon /> Clear
            </Button>
            <Button
              size="lg"
              className="px-3 text-[13px]"
              disabled={compareIds.length < 2}
              onClick={() => setStep("compare")}
            >
              Compare {compareIds.length}
              <ArrowRightIcon data-icon="inline-end" />
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
        "inline-flex items-center gap-1 rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40",
        align === "right" && "flex-row-reverse",
        active && "text-ink",
        tip && "underline decoration-line-strong decoration-dotted underline-offset-2",
      )}
    />
  );
  const inner = (
    <>
      {children}
      <Arrow className={cn("size-3", !active && "invisible")} aria-hidden />
    </>
  );
  return (
    <TableHead
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
    </TableHead>
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
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      aria-selected={selected}
      onClick={onOpen}
      className={cn(
        "group cursor-pointer border-0 hover:bg-surface-2",
        selected && "bg-accent-soft/70 hover:bg-accent-soft data-[state=selected]:bg-accent-soft/70",
      )}
    >
      <TableCell
        className={cn(
          cell,
          "pl-4",
          selected && "shadow-[inset_2px_0_0_var(--primary)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          aria-label={`Compare ${c.name}`}
          checked={compared}
          disabled={!compared && compareFull}
          onCheckedChange={onToggle}
          className="border-line-strong bg-surface"
        />
      </TableCell>
      <TableCell className={cn(cell, "text-right font-mono text-[12.5px] text-ink-3 tabular-nums")}>
        {c.rank}
      </TableCell>
      <TableCell className={cn(cell, "max-w-[340px]")}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className={cn(
              "truncate rounded-sm text-left font-medium text-ink outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40",
              selected && "text-accent-ink",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            {c.name}
          </button>
          {c.preregistered === false && (
            <StatusBadge tone="gap" className="h-5 px-1.5 text-[11px]">
              not preregistered
            </StatusBadge>
          )}
        </div>
      </TableCell>
      <TableCell className={cell}>
        <div className="flex items-center gap-3" aria-label={`Reversal ${c.consensus.toFixed(2)}`}>
          <span className="w-11 text-right font-mono text-[13px] font-medium text-ink tabular-nums">
            {c.consensus.toFixed(2)}
          </span>
          <span className="hidden xl:block"><ReversalBar score={c.consensus} /></span>
        </div>
      </TableCell>
      <TableCell className={cn(cell, "hidden text-right font-mono text-[13px] text-ink-2 tabular-nums xl:table-cell")}>
        {c.n_ranking_contexts}
      </TableCell>
      <TableCell className={cn(cell, "hidden xl:table-cell")}>
        {c.brain_cells ? (
          <div className="flex items-center gap-1">
            {neural.length ? (
              <>
                {neural.slice(0, 1).map((x) => (
                  <StatusBadge key={x.cell_id} tone="ok" className="h-5 px-1.5 font-mono text-[11px]">
                    {`${x.cell_id} ${x.consensus.toFixed(2)}`}
                  </StatusBadge>
                ))}
                {neural.length > 1 && (
                  <span className="font-mono text-[11px] text-ink-3">+{neural.length - 1}</span>
                )}
              </>
            ) : (
              <StatusBadge tone="ok" className="h-5 px-1.5 text-[11px]">
                <BrainIcon weight="fill" /> Neural
              </StatusBadge>
            )}
          </div>
        ) : (
          <span className="sr-only">None</span>
        )}
      </TableCell>
      <TableCell className={cell}>
        <StatusBadge className="h-5 border-transparent bg-transparent px-0 text-[12.5px] font-normal text-ink-2">
          <span className={cn("size-1.5 rounded-full", exposureTone(c.exposure_label, c.penetrant))} />
          {exposure}
        </StatusBadge>
      </TableCell>
      <TableCell className={cn(cell, "pr-4")}>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge
            className={cn(
              "h-5 px-1.5 text-[11.5px]",
              approval !== "approved" && "border-transparent bg-transparent px-0 text-ink-3",
            )}
          >
            {sentence(approval ?? "unspecified")}
          </StatusBadge>
          <WithdrawnBadge approval={c.approval_status} size="sm" />
        </div>
      </TableCell>
    </TableRow>
  );
}
