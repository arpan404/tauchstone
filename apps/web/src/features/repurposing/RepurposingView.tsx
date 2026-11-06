import { useCandidates, useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUi } from "@/store/ui";
import { useMemo, useState } from "react";
import { Search, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import "./workspace.css";

type Candidate = Schema<"Candidate">;

function compareDiscovery(a: Candidate, b: Candidate, sort: string) {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "contexts") {
    return b.n_ranking_contexts - a.n_ranking_contexts || a.rank - b.rank;
  }
  if (sort === "consensus") return a.consensus - b.consensus || a.rank - b.rank;
  return a.rank - b.rank;
}

export function RepurposingView() {
  const { data, isLoading, isError } = useCandidates(50);
  const mockData = useMockStatus(data?.provenance);
  const { selectedCandidateId, selectCandidate, setStep } = useUi();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("rank");
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [compared, setCompared] = useState<string[]>([]);
  const selected = data?.candidates.find((c) => c.id === selectedCandidateId);

  const candidates = useMemo(
    () =>
      (data?.candidates ?? [])
        .filter(
          (c) =>
            (c.name.toLowerCase().includes(query.trim().toLowerCase()) ||
              c.id.toLowerCase().includes(query.trim().toLowerCase())) &&
            (!negativeOnly || c.consensus < 0),
        )
        .slice()
        .sort((a, b) => compareDiscovery(a, b, sort)),

    [data, query, sort, negativeOnly],
  );
  const perm = data?.permutation_control;

  return (
    <div className="candidate-workspace flex h-full min-h-0 flex-col bg-background text-foreground">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-5 lg:p-7">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h2 className="text-[22px] font-semibold tracking-tight">Repurposing candidates</h2>
          {data && (
            <p className="text-xs text-muted-foreground">
              {data.n_ranked} compounds ranked · signature {data.signature}
            </p>
          )}
          {perm && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  aria-label={`Permutation control: ${perm.passed ? "passed" : "top-20 not all significant (gate: all 20 at p < 0.05)"}`}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                  <span>Permutation control</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{perm.passed ? "Passed" : "Gate unmet"}</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  The gate requires all top-20 compounds at p &lt; 0.05. The disease labels are shuffled and the ranking is recomputed
                  ({perm.n_permutations ?? 200} permutations). The gate passes
                  only if all top-20 compounds beat the shuffled null at p &lt;
                  0.05.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {isLoading && <Skeleton className="h-[300px] w-full" />}
        {isError && (
          <p role="alert" className="text-sm text-red-700">
            Could not load candidates.
          </p>
        )}
        {data && (
          <>
            {compared.length > 0 && <section aria-label="Candidate comparison">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                <h3 className="text-sm font-medium">Discovery comparison ({compared.length}/3)</h3>
                <Button variant="ghost" size="sm" onClick={() => setCompared([])}>Clear comparison</Button>
              </div>
              <div className="grid gap-3 pt-3 md:grid-cols-3">
                {compared.map(id => data.candidates.find(c => c.id === id)).filter((c): c is Candidate => !!c).map(c => <div key={c.id} className="min-w-0 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{c.name}</span><Button variant="ghost" size="sm" aria-label={`Remove ${c.name}`} onClick={() => setCompared(ids => ids.filter(id => id !== c.id))}>Remove</Button></div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">{[
                    ["Rank", c.rank], ["Consensus", c.consensus.toFixed(3)],
                    ["IQR", c.consensus_iqr.map(v => v.toFixed(3)).join(" to ")], ["Contexts", c.n_ranking_contexts],
                    ["WTCS", c.scores.wtcs.toFixed(3)], ["KS", c.scores.ks.toFixed(3)], ["Cosine", c.scores.cosine.toFixed(3)],
                  ].map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-mono tabular-nums">{value}</dd></div>)}</dl>
                </div>)}
              </div>
            </section>}
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <section
                aria-label="Candidate inspector"
                className="order-first min-w-0 self-start lg:order-last lg:col-start-2 lg:row-start-1"
              >
                <Card>
                  {selected ? (
                    <>
                      <CardHeader>
                        <CardTitle>{selected.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="break-all text-xs text-muted-foreground">{selected.id}</p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {[
                            ["Discovery rank", selected.rank],
                            ["Consensus", selected.consensus.toFixed(3)],
                            ["IQR", selected.consensus_iqr.map(v => v.toFixed(3)).join(" to ")],
                            ["Ranking contexts", selected.n_ranking_contexts],
                            ["WTCS", selected.scores.wtcs.toFixed(3)],
                            ["KS", selected.scores.ks.toFixed(3)],
                            ["Cosine", selected.scores.cosine.toFixed(3)],
                            ["Approval", selected.approval_status?.status ?? "unspecified"],
                          ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-xs tabular-nums">{value}</dd></div>)}
                        </dl>
                        {selected.flags?.length ? <p className="text-xs text-muted-foreground">Flags: {selected.flags.join(", ")}</p> : null}
                        <div className="flex flex-wrap gap-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStep("evidence")}
                          >
                            Evidence
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setStep("attack")}
                          >
                            Experiments
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              !compared.includes(selected.id) &&
                              compared.length >= 3
                            }
                            onClick={() =>
                              setCompared((ids) =>
                                ids.includes(selected.id)
                                  ? ids.filter((id) => id !== selected.id)
                                  : [...ids, selected.id],
                              )
                            }
                          >
                            {compared.includes(selected.id)
                              ? "Remove from comparison"
                              : "Add to comparison"}
                          </Button>
                        </div>
                        {compared.length >= 3 &&
                          !compared.includes(selected.id) && (
                            <p className="text-xs text-muted-foreground">
                              Comparison is full. Remove a candidate to add
                              another.
                            </p>
                          )}
                      </CardContent>
                    </>
                  ) : (
                    <CardContent>
                      <p className="py-4 text-sm text-muted-foreground">
                        Select a candidate to inspect discovery scores and open
                        evidence or experiments.
                      </p>
                    </CardContent>
                  )}
                </Card>
              </section>

              <section className="candidate-table-pane flex min-h-0 min-w-0 flex-col lg:col-start-1 lg:row-start-1">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <div className="grid min-w-40 flex-1 gap-1.5">
                      <label htmlFor="candidate-search" className="text-xs text-muted-foreground">Search name or ID</label>
                      <div className="relative"><Search aria-hidden="true" className="absolute left-2.5 top-2 size-4 text-muted-foreground"/><Input id="candidate-search" aria-label="Search name or ID" className="pl-8" value={query} onChange={e => setQuery(e.target.value)} /></div>
                    </div>
                    <div className="grid gap-1.5"><span id="candidate-sort-label" className="text-xs text-muted-foreground">Sort</span>
                    <Select value={sort} onValueChange={v => setSort(v ?? "rank")}>
                      <SelectTrigger aria-label="Sort"><SelectValue>{(value) => ({rank: "Discovery rank", consensus: "Consensus ascending", name: "Name", contexts: "Ranking contexts descending"}[String(value)])}</SelectValue></SelectTrigger>
                      <SelectContent>{Object.entries({rank: "Discovery rank", consensus: "Consensus ascending", name: "Name", contexts: "Ranking contexts descending"}).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select></div>
                    <label className="flex h-8 items-center gap-2 text-xs"><Checkbox aria-label="Negative consensus only" checked={negativeOnly} onCheckedChange={setNegativeOnly}/>Negative consensus only</label>
                    <Button variant="ghost" size="sm" onClick={() => {setQuery(""); setNegativeOnly(false); setSort("rank");}}>Clear controls</Button>
                  </div>
                  <p role="status" className="mb-2 text-xs text-muted-foreground">{candidates.length} of {data.candidates.length} loaded · {data.n_ranked} ranked</p>
                  <p className="mb-3 text-[11px] text-muted-foreground">Negative consensus indicates reversal. Select a candidate to inspect its discovery scores.</p>
                  {candidates.length === 0 && (
                    <p>No candidates match these controls.</p>
                  )}
                  <div role="region" aria-label="Candidate results" className="candidate-results min-h-0 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
                        {["Rank", "Candidate", "Consensus", "Contexts"].map(h => <TableHead key={h}>{h}</TableHead>)}
                      </TableRow></TableHeader>
                      <TableBody>{candidates.map(c => <TableRow key={c.id} aria-selected={c.id === selectedCandidateId} onClick={() => selectCandidate(c.id)} className={`cursor-pointer ${c.id === selectedCandidateId ? "bg-primary/8 hover:bg-primary/8" : ""}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{c.rank}</TableCell>
                        <TableCell><Button variant="ghost" className="h-auto max-w-full justify-start px-1 py-0 text-left font-medium" aria-label={`Select ${c.name}, rank ${c.rank}, consensus ${c.consensus.toFixed(2)}`} onClick={() => selectCandidate(c.id)}><span className="truncate">{c.name}</span></Button></TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{c.consensus.toFixed(3)}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{c.n_ranking_contexts}</TableCell>
                      </TableRow>)}</TableBody>
                    </Table>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
