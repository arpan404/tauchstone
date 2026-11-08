import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CrosshairIcon,
  FlaskIcon,
  ListChecksIcon,
  ListMagnifyingGlassIcon,
  MagnifyingGlassIcon,
  MinusCircleIcon,
  QuestionIcon,
  SealWarningIcon,
  XCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useLookup } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { EmptyState, Panel, StatusBadge, type Tone } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useUi } from "@/store/ui";
import { cn } from "cn";

type Result = Schema<"LookupResult">;

const STATUS: Record<Result["status"], { label: string; tone: Tone; icon: Icon }> = {
  ranked: { label: "ranked", tone: "accent", icon: CheckCircleIcon },
  not_rankable: { label: "not rankable", tone: "neutral", icon: MinusCircleIcon },
  not_in_lincs: { label: "not in LINCS", tone: "gap", icon: XCircleIcon },
  unrecognized: { label: "name not recognised", tone: "neutral", icon: QuestionIcon },
};

/** Rounded table rows with no hard lines (glass tables, Nov 8 direction). */
const ROW =
  "border-0 [&>td]:border-0 [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl";

const COLUMNS = [
  "Query",
  "Matched",
  "Status",
  "Pool rank",
  "Reversal",
  "Contexts",
  "Ready",
  "Action",
] as const;

const NUMERIC = new Set(["Pool rank", "Reversal", "Contexts"]);

function Dash() {
  return <span className="text-ink-3">n/a</span>;
}

export function CompoundsView({
  projectId,
  onBuildTests,
}: {
  projectId?: string;
  onBuildTests?: (result: Result) => void;
} = {}) {
  const [input, setInput] = useState(
    "donepezil, memantine, galantamine, rivastigmine, nepafenac",
  );
  const lookup = useLookup();
  const mock = useMockStatus();
  const reduce = useReducedMotion();
  const { selectCandidate, setStep } = useUi();
  const names = input
    .split(/[,\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  const results = lookup.data ?? [];
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  function check() {
    lookup.mutate({ names, ...(projectId ? { project_id: projectId } : {}) });
  }
  function attack(result: Result) {
    if (onBuildTests && !result.attack_ready) {
      onBuildTests(result);
      return;
    }
    if (!result.drug_id) return;
    selectCandidate(result.drug_id);
    setStep("attack");
  }
  function openDrug(result: Result) {
    if (!result.drug_id) return;
    selectCandidate(result.drug_id);
    setStep("evidence");
  }

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mock} />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <motion.div
          className="mx-auto grid max-w-[1360px] items-start gap-4 min-[1400px]:grid-cols-[316px_minmax(0,1fr)]"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Panel
            title="Compounds"
            icon={<ListMagnifyingGlassIcon />}
            actions={
              <StatusBadge tone="gap" size="sm">
                <SealWarningIcon aria-hidden />
                not preregistered
              </StatusBadge>
            }
            className="min-[1400px]:sticky min-[1400px]:top-0"
          >
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                check();
              }}
            >
              <label
                htmlFor="compound-names"
                className="block text-[12px] font-medium text-ink-3"
              >
                Compound names
              </label>
              <Textarea
                id="compound-names"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  lookup.reset();
                }}
                placeholder="Compound names · comma or newline"
                spellCheck={false}
                className="min-h-24 min-[1400px]:min-h-40 resize-y rounded-xl border-0 bg-white/70 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink ring-1 ring-ink/12 backdrop-blur placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-primary/45"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] text-ink-3 tabular-nums">
                  {names.length} {names.length === 1 ? "name" : "names"}
                </span>
                <Button
                  type="submit"
                  disabled={!names.length || lookup.isPending}
                >
                  <MagnifyingGlassIcon aria-hidden />
                  {lookup.isPending ? "Checking" : "Check"}
                </Button>
              </div>
              {lookup.isError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad"
                >
                  Lookup unavailable
                  <Button type="button" variant="outline" size="sm" onClick={check}>
                    <ArrowClockwiseIcon aria-hidden /> Retry
                  </Button>
                </div>
              )}
            </form>
          </Panel>

          <Panel
            title="Results"
            icon={<ListChecksIcon />}
            caption={results.length ? `${results.length} checked` : undefined}
            bodyClassName="px-3 pt-1 pb-3"
            aria-live="polite"
            actions={
              results.length > 0 && (
                <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                  {(Object.keys(STATUS) as Result["status"][])
                    .filter((s) => counts[s])
                    .map((s) => {
                      const StatusIcon = STATUS[s].icon;
                      return (
                        <StatusBadge key={s} tone={STATUS[s].tone}>
                          <StatusIcon aria-hidden />
                          <span className="font-mono tabular-nums">{counts[s]}</span>
                          {STATUS[s].label}
                        </StatusBadge>
                      );
                    })}
                </div>
              )
            }
          >
            {!results.length && !lookup.isPending ? (
              <EmptyState
                icon={
                  <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-primary [&>svg]:size-5">
                    <FlaskIcon />
                  </span>
                }
                title="No compounds checked"
                className="m-0 min-h-64 rounded-xl border-0 bg-white/45 ring-1 ring-white/80"
              />
            ) : (
              <Table
                aria-label="Compound results"
                className="border-separate border-spacing-y-0.5 text-[13px]"
              >
                <TableHeader className="[&_tr]:border-0">
                  <TableRow className="border-0 hover:bg-transparent">
                    {COLUMNS.map((h) => (
                      <TableHead
                        key={h}
                        scope="col"
                        className={cn(
                          "h-8 px-2 text-[11.5px] font-medium text-ink-3 first:pl-3 last:pr-3",
                          NUMERIC.has(h) && "text-right",
                          h === "Action" && "text-right",
                        )}
                      >
                        {h === "Action" ? <span className="sr-only">Action</span> : h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lookup.isPending &&
                    names.map((n, i) => (
                      <TableRow key={`${n}-${i}`} className={cn(ROW, "hover:bg-transparent")}>
                        <TableCell className="h-11 px-2 pl-3 text-ink-2">{n}</TableCell>
                        {COLUMNS.slice(1).map((c) => (
                          <TableCell key={c} className="px-2 last:pr-3">
                            <Skeleton className="h-4 w-full max-w-20 rounded-full bg-ink/[0.06]" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {!lookup.isPending &&
                    results.map((result, i) => {
                      const ranked = result.status === "ranked";
                      const status = STATUS[result.status];
                      const StatusIcon = status.icon;
                      return (
                        <TableRow
                          key={`${result.query}-${i}`}
                          className={cn(ROW, "h-12 hover:bg-primary/6")}
                        >
                          <TableCell className="px-2 pl-3 text-ink-2">{result.query}</TableCell>
                          <TableCell className="px-2 font-medium text-ink">
                            {result.name ?? <Dash />}
                          </TableCell>
                          <TableCell className="px-2">
                            <StatusBadge tone={status.tone}>
                              <StatusIcon aria-hidden weight={result.status === "ranked" ? "fill" : "regular"} />
                              {status.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="px-2 text-right font-mono tabular-nums">
                            {ranked && result.pool_rank != null ? (
                              `${result.pool_rank.toLocaleString("en-US")} / ${(result.rank_total ?? 1816).toLocaleString("en-US")}`
                            ) : (
                              <Dash />
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "px-2 text-right font-mono tabular-nums",
                              result.consensus != null && result.consensus < 0
                                ? "font-medium text-primary"
                                : "text-ink-2",
                            )}
                          >
                            {result.consensus == null ? (
                              <Dash />
                            ) : (
                              `${result.consensus > 0 ? "+" : ""}${result.consensus.toFixed(2)}`
                            )}
                          </TableCell>
                          <TableCell className="px-2 text-right font-mono tabular-nums">
                            {result.n_contexts ?? <Dash />}
                          </TableCell>
                          <TableCell className="px-2">
                            {ranked ? (
                              result.attack_ready ? (
                                <span className="inline-flex items-center gap-1 text-ok">
                                  <CheckCircleIcon weight="fill" aria-hidden className="size-4" />
                                  yes
                                </span>
                              ) : (
                                <span className="text-ink-3">no</span>
                              )
                            ) : (
                              <Dash />
                            )}
                          </TableCell>
                          <TableCell className="px-2 pr-3">
                            {ranked && (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant={result.attack_ready ? "default" : "outline"}
                                  disabled={!result.drug_id && !onBuildTests}
                                  onClick={() => attack(result)}
                                >
                                  {result.attack_ready ? (
                                    <CrosshairIcon aria-hidden />
                                  ) : (
                                    <FlaskIcon aria-hidden />
                                  )}
                                  {result.attack_ready ? "Attack" : "Build tests"}
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  className="rounded-full text-ink-2 hover:bg-primary/8 hover:text-primary"
                                  disabled={!result.drug_id}
                                  aria-label={`Open drug ${result.name ?? result.query}`}
                                  title="Open drug"
                                  onClick={() => openDrug(result)}
                                >
                                  <ArrowSquareOutIcon aria-hidden />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
export const MyCompoundsView = CompoundsView;
