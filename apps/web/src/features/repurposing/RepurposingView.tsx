import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon, BrainIcon, FunnelSimpleXIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useProjectCandidates, type CandidateFilters } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { StatusBadge, Toolbar } from "@/components/system";
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
import { useUi } from "@/store/ui";
import { ReversalBar } from "./ReversalBar";
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
  const filters = toFilters(keys);
  const { data, isPending, isError, refetch } = useProjectCandidates(
    projectId,
    filters,
  );
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
        <Toolbar className="sticky top-0 z-20 mb-0 h-14 flex-nowrap bg-canvas">
          <ToggleGroup
            multiple
            value={keys}
            onValueChange={(v) => setKeys(v as FilterKey[])}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Filters"
            className="bg-surface"
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
            className="ml-auto font-mono text-[12.5px] text-ink-3 tabular-nums"
          >
            {data
              ? `${data.candidates.length} of ${data.n_ranked.toLocaleString("en-US")}`
              : isError
                ? ""
                : "Loading"}
          </span>
        </Toolbar>

        {isError ? (
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
              <TableHeader className="sticky top-14 z-10 [&_tr]:border-0 [&_th]:border-b [&_th]:border-line">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(head, "w-11 rounded-tl-lg pl-4")}>
                    <span className="sr-only">Compare</span>
                  </TableHead>
                  <TableHead className={cn(head, "w-12 text-right")}>#</TableHead>
                  <TableHead className={head}>Drug</TableHead>
                  <TableHead className={cn(head, "w-44")}>Reversal</TableHead>
                  <TableHead className={cn(head, "w-20 text-right")}>Contexts</TableHead>
                  <TableHead className={cn(head, "w-40")}>Brain cells</TableHead>
                  <TableHead className={cn(head, "w-44")}>Exposure</TableHead>
                  <TableHead className={cn(head, "w-32 rounded-tr-lg pr-4")}>Approval</TableHead>
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
                      <TableCell className={cell}><Skeleton className="ml-auto h-3 w-5 bg-line/70" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-20 bg-line/70" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-28 bg-line/70" /></TableCell>
                      <TableCell className={cn(cell, "pr-4")}><Skeleton className="h-5 w-16 bg-line/70" /></TableCell>
                    </TableRow>
                  ))}
                {data?.candidates.map((c) => (
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
                        <Button variant="outline" size="lg" onClick={() => setKeys([])}>
                          <FunnelSimpleXIcon /> Clear filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
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
          <ReversalBar score={c.consensus} />
        </div>
      </TableCell>
      <TableCell className={cn(cell, "text-right font-mono text-[13px] text-ink-2 tabular-nums")}>
        {c.n_ranking_contexts}
      </TableCell>
      <TableCell className={cell}>
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
        <StatusBadge
          className={cn(
            "h-5 px-1.5 text-[11.5px]",
            approval !== "approved" && "border-transparent bg-transparent px-0 text-ink-3",
          )}
        >
          {sentence(approval ?? "unspecified")}
        </StatusBadge>
      </TableCell>
    </TableRow>
  );
}
