import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  Crosshair,
  Flask,
  MagnifyingGlass,
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

const STATUS: Record<Result["status"], { label: string; tone: Tone }> = {
  ranked: { label: "ranked", tone: "accent" },
  not_rankable: { label: "not rankable", tone: "neutral" },
  not_in_lincs: { label: "not in LINCS", tone: "gap" },
  unrecognized: { label: "name not recognised", tone: "bad" },
};

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
  return <span className="text-ink-3/60">n/a</span>;
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
      <div className="flex-1 overflow-auto p-6">
        <motion.div
          className="mx-auto grid max-w-[1360px] items-start gap-4 lg:grid-cols-[272px_minmax(0,1fr)]"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Panel
            title="Compounds"
            actions={<StatusBadge tone="gap">not preregistered</StatusBadge>}
            className="lg:sticky lg:top-0"
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
                className="block text-[12px] font-medium text-ink-2"
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
                className="min-h-40 resize-y rounded-md border-line-strong bg-surface text-[13.5px] leading-relaxed"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[12px] text-ink-3 tabular-nums">
                  {names.length} {names.length === 1 ? "name" : "names"}
                </span>
                <Button
                  type="submit"
                  disabled={!names.length || lookup.isPending}
                >
                  <MagnifyingGlass aria-hidden />
                  {lookup.isPending ? "Checking" : "Check"}
                </Button>
              </div>
              {lookup.isError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad"
                >
                  Lookup unavailable
                  <Button type="button" variant="outline" size="sm" onClick={check}>
                    <ArrowClockwise aria-hidden /> Retry
                  </Button>
                </div>
              )}
            </form>
          </Panel>

          <Panel
            title="Results"
            flush
            aria-live="polite"
            actions={
              results.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {(Object.keys(STATUS) as Result["status"][])
                    .filter((s) => counts[s])
                    .map((s) => (
                      <StatusBadge key={s} tone={STATUS[s].tone}>
                        <span className="font-mono tabular-nums">{counts[s]}</span>
                        {STATUS[s].label}
                      </StatusBadge>
                    ))}
                </div>
              )
            }
          >
            {!results.length && !lookup.isPending ? (
              <EmptyState
                icon={<Flask />}
                title="No compounds checked"
                className="m-4 min-h-64 border-line"
              />
            ) : (
              <Table aria-label="Compound results" className="text-[13px]">
                <TableHeader>
                  <TableRow className="border-line bg-surface-2 hover:bg-surface-2">
                    {COLUMNS.map((h) => (
                      <TableHead
                        key={h}
                        scope="col"
                        className={cn(
                          "h-8 px-1.5 text-[12px] font-medium text-ink-3 first:pl-4 last:pr-4",
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
                      <TableRow key={`${n}-${i}`} className="border-line">
                        <TableCell className="px-1.5 py-2 pl-4 text-ink-2">{n}</TableCell>
                        {COLUMNS.slice(1).map((c) => (
                          <TableCell key={c} className="px-1.5 py-2 last:pr-4">
                            <Skeleton className="h-4 w-full max-w-20" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {!lookup.isPending &&
                    results.map((result, i) => {
                      const ranked = result.status === "ranked";
                      const status = STATUS[result.status];
                      return (
                        <TableRow
                          key={`${result.query}-${i}`}
                          className="h-11 border-line hover:bg-surface-2"
                        >
                          <TableCell className="px-1.5 pl-4 text-ink-2">{result.query}</TableCell>
                          <TableCell className="px-1.5 font-medium text-ink">
                            {result.name ?? <Dash />}
                          </TableCell>
                          <TableCell className="px-1.5">
                            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="px-1.5 text-right font-mono tabular-nums">
                            {ranked && result.pool_rank != null ? (
                              `${result.pool_rank.toLocaleString("en-US")} / ${(result.rank_total ?? 1816).toLocaleString("en-US")}`
                            ) : (
                              <Dash />
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "px-1.5 text-right font-mono tabular-nums",
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
                          <TableCell className="px-1.5 text-right font-mono tabular-nums">
                            {result.n_contexts ?? <Dash />}
                          </TableCell>
                          <TableCell className="px-1.5">
                            {ranked ? (
                              result.attack_ready ? (
                                <span className="inline-flex items-center gap-1 text-ok">
                                  <CheckCircle weight="fill" aria-hidden className="size-4" />
                                  yes
                                </span>
                              ) : (
                                <span className="text-ink-3">no</span>
                              )
                            ) : (
                              <Dash />
                            )}
                          </TableCell>
                          <TableCell className="px-1.5 pr-4">
                            {ranked && (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant={result.attack_ready ? "default" : "outline"}
                                  disabled={!result.drug_id && !onBuildTests}
                                  onClick={() => attack(result)}
                                >
                                  {result.attack_ready && <Crosshair aria-hidden />}
                                  {result.attack_ready ? "Attack" : "Build tests"}
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  disabled={!result.drug_id}
                                  aria-label={`Open drug ${result.name ?? result.query}`}
                                  title="Open drug"
                                  onClick={() => openDrug(result)}
                                >
                                  <ArrowSquareOut aria-hidden />
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
