import { useCandidates, useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useUi } from "@/store/ui";
import { useMemo, useState } from "react";
import { Search, ArrowRight, ChevronDown, FlaskConical } from "lucide-react";
import "./workspace.css";

type Candidate = Schema<"Candidate">;
const notesKey = "tauchstone.repurposing.research-notes.v1";
const comparisonKey = "tauchstone.repurposing.comparison.v1";
const sorts = { rank: "Discovery rank", consensus: "Consensus ascending", name: "Name", contexts: "Ranking contexts descending" };
function readStored(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}
function readNotes(): Record<string, string> {
  const value = readStored(notesKey);
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string")) : {};
}
function readComparison(): string[] {
  const value = readStored(comparisonKey);
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))].slice(0, 3) : [];
}
function metrics(c: Candidate) {
  return [["Discovery rank", c.rank], ["Consensus", c.consensus.toFixed(3)],
    ["IQR", c.consensus_iqr.map(v => v.toFixed(3)).join(" to ")], ["Ranking contexts", c.n_ranking_contexts],
    ["WTCS", c.scores.wtcs.toFixed(3)], ["KS", c.scores.ks.toFixed(3)],
    ["Cosine", c.scores.cosine.toFixed(3)], ["Approval", c.approval_status?.status ?? "unspecified"]];
}
export function RepurposingView() {
  const { data, isLoading, isError } = useCandidates(50);
  const mockData = useMockStatus(data?.provenance);
  const { selectedCandidateId, selectCandidate, setStep } = useUi();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("rank");
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [view, setView] = useState("browse");
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [notes, setNotes] = useState(readNotes);
  const [notesSaved, setNotesSaved] = useState(true);
  const [compared, setCompared] = useState(readComparison);
  const selected = data?.candidates.find(c => c.id === selectedCandidateId);
  const candidates = useMemo(() => (data?.candidates ?? []).filter(c =>
    (c.name.toLowerCase().includes(query.trim().toLowerCase()) || c.id.toLowerCase().includes(query.trim().toLowerCase())) && (!negativeOnly || c.consensus < 0))
    .sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "contexts" ? b.n_ranking_contexts - a.n_ranking_contexts || a.rank-b.rank : sort === "consensus" ? a.consensus-b.consensus || a.rank-b.rank : a.rank-b.rank), [data, query, sort, negativeOnly]);
  function choose(id: string) { selectCandidate(id); setMetricsOpen(false); }
  function updateComparison(ids: string[]) {
    setCompared(ids);
    try { localStorage.setItem(comparisonKey, JSON.stringify(ids)); } catch { /* Comparison still works for this visit. */ }
  }
  function updateNote(id: string, value: string) {
    const next = { ...notes, [id]: value };
    setNotes(next);
    try { localStorage.setItem(notesKey, JSON.stringify(next)); setNotesSaved(true); }
    catch { setNotesSaved(false); }
  }
  const comparison = compared.map(id => data?.candidates.find(c => c.id === id)).filter((c): c is Candidate => !!c);
  return <div className="candidate-workspace flex h-full min-h-0 flex-col bg-background text-foreground">
    <BoundaryBanner /><MockRibbon show={mockData} />
    {isLoading && <div className="grid flex-1 grid-cols-[1fr_2fr] gap-6 p-6"><Skeleton /><Skeleton /></div>}
    {isError && <p role="alert" className="p-6">Could not load candidates. Reload the page to try again.</p>}
    {data && <div className="investigation-layout">
      <aside aria-label="Discovery browser" className="discovery-browser">
        <Tabs className="discovery-tabs" value={view} onValueChange={value => setView(String(value))}>
          <TabsList className="w-full" aria-label="Candidate view"><TabsTrigger value="browse">Browse</TabsTrigger><TabsTrigger value="ranking">Ranking</TabsTrigger></TabsList>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><label htmlFor="candidate-search" className="text-xs text-muted-foreground">Search name or ID</label><div className="relative"><Search aria-hidden="true" className="absolute left-2.5 top-2 size-4 text-muted-foreground"/><Input id="candidate-search" aria-label="Search name or ID" className="bg-card pl-8" value={query} onChange={e => setQuery(e.target.value)}/></div></div>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Sort</span><Select value={sort} onValueChange={value => setSort(value ?? "rank")}><SelectTrigger aria-label="Sort" className="min-w-0 flex-1 bg-card"><SelectValue>{value => sorts[String(value) as keyof typeof sorts]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(sorts).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <label className="flex items-center gap-2 text-xs"><Checkbox aria-label="Negative consensus only" checked={negativeOnly} onCheckedChange={setNegativeOnly}/>Negative consensus only</label>
        </div>
        <div className="flex items-center justify-between gap-2"><span role="status" className="text-xs text-muted-foreground">{candidates.length} of {data.candidates.length} loaded</span><Button variant="ghost" size="sm" onClick={() => { setQuery(""); setSort("rank"); setNegativeOnly(false); }}>Clear controls</Button></div>
        <TabsContent value={view} className="discovery-results"><div role="region" aria-label="Candidate results">
          {!candidates.length && <p className="p-3 text-sm text-muted-foreground">No candidates match these controls. Clear controls to browse again.</p>}
          {view === "browse" ? <div className="grid gap-1">{candidates.map(c => <Button key={c.id} variant="ghost" aria-pressed={c.id === selectedCandidateId} aria-label={`Select ${c.name}, rank ${c.rank}, consensus ${c.consensus.toFixed(2)}`} onClick={() => choose(c.id)} className={`candidate-item ${c.id === selectedCandidateId ? "bg-primary/10 text-foreground hover:bg-primary/10" : ""}`}><span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.name}</span><span className="mt-1 flex gap-3 text-xs font-normal text-muted-foreground"><span>Rank <span className="font-mono">{c.rank}</span></span><span>Consensus <span className="font-mono">{c.consensus.toFixed(2)}</span></span></span></span><ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground"/></Button>)}</div>
          : <Table className="text-xs"><TableHeader className="sticky top-0 z-10 bg-background"><TableRow>{["Rank", "Candidate", "Consensus"].map(h => <TableHead className="px-1 text-xs" key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{candidates.map(c => <TableRow key={c.id} aria-selected={c.id === selectedCandidateId} className={c.id === selectedCandidateId ? "bg-primary/10" : ""}><TableCell className="px-1 font-mono">{c.rank}</TableCell><TableCell className="max-w-28 px-1"><Button variant="ghost" size="sm" className="max-w-full px-1 text-xs" aria-label={`Select ${c.name}, rank ${c.rank}, consensus ${c.consensus.toFixed(2)}`} onClick={() => choose(c.id)}><span className="truncate">{c.name}</span></Button></TableCell><TableCell className="px-1 font-mono">{c.consensus.toFixed(3)}</TableCell></TableRow>)}</TableBody></Table>}
        </div></TabsContent>
        <p className="text-xs leading-relaxed text-muted-foreground">Discovery fields only. {data.n_ranked} compounds ranked against {data.signature}.</p>
        </Tabs>
      </aside>
      <section aria-label="Candidate inspector" className="investigation-pane">
        {selected ? <div className="mx-auto w-full max-w-3xl space-y-7">
          <header><p className="mb-2 break-all text-xs text-muted-foreground">{selected.id}</p><h2 className="text-2xl font-semibold tracking-tight">{selected.name}</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{selected.consensus < 0 ? "Negative consensus indicates reversal of the AD minus control expression signature" : "Consensus is non-negative for the AD minus control expression signature"} across {selected.n_ranking_contexts} ranking contexts. This discovery result is a starting point for investigation.</p></header>
          <div className="flex flex-wrap gap-2"><Button onClick={() => setStep("evidence")}>Evidence<ArrowRight aria-hidden="true" className="size-4"/></Button><Button variant="outline" onClick={() => setStep("attack")}>Experiments<FlaskConical aria-hidden="true" className="size-4"/></Button><Button variant="ghost" disabled={!compared.includes(selected.id) && compared.length >= 3} onClick={() => updateComparison(compared.includes(selected.id) ? compared.filter(id => id !== selected.id) : [...compared, selected.id])}>{compared.includes(selected.id) ? "Remove from comparison" : "Add to comparison"}</Button></div>
          {compared.length >= 3 && !compared.includes(selected.id) && <p className="text-xs text-muted-foreground">Comparison is full. Remove a candidate to add another.</p>}
          <section className="border-t border-border pt-5"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><label htmlFor="candidate-notes" className="text-sm font-medium">Research notes</label><span role="status" className="text-xs text-muted-foreground">{notesSaved ? "Saved on this device" : "Could not save on this device. Keep a copy before leaving."}</span></div><Textarea id="candidate-notes" aria-label="Research notes" aria-describedby="notes-boundary" value={notes[selected.id] ?? ""} onChange={e => updateNote(selected.id, e.target.value)} className="min-h-44 resize-y bg-card leading-relaxed" placeholder="Write your observations and questions for this candidate."/><p id="notes-boundary" className="mt-2 text-xs text-muted-foreground">Private to this browser. Notes are never sent to the API or used in ranking.</p></section>
          <section className="border-t border-border pt-3"><Button variant="ghost" className="w-full justify-between px-0" aria-expanded={metricsOpen} aria-controls="discovery-metrics" onClick={() => setMetricsOpen(!metricsOpen)}>Discovery metrics<ChevronDown aria-hidden="true" className={`size-4 ${metricsOpen ? "rotate-180" : ""}`}/></Button>{metricsOpen && <div id="discovery-metrics" className="pt-4"><dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">{metrics(selected).map(([label,value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xs font-mono">{value}</dd></div>)}</dl>{selected.flags?.length ? <p className="mt-4 text-xs">Flags: {selected.flags.join(", ")}</p> : null}<p className="mt-4 text-xs text-muted-foreground">AD minus control; negative drug scores indicate reversal. Filters use discovery ranking fields only.</p>{data.permutation_control && <p className="mt-2 text-xs text-muted-foreground">Permutation control: {data.permutation_control.passed ? "passed" : "top-20 not all significant"}. Gate: all top-20 compounds at p &lt; 0.05 across {data.permutation_control.n_permutations ?? 200} permutations.</p>}</div>}</section>
        </div> : <div className="investigation-empty"><FlaskConical aria-hidden="true" className="mb-5 size-8 text-primary"/><h2 className="text-xl font-semibold tracking-tight">Choose a candidate to investigate</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Browse the discovery collection, then open evidence, plan experiments or keep your own research notes.</p><Button variant="outline" className="mt-6" onClick={() => document.getElementById("candidate-search")?.focus()}>Search candidates<Search aria-hidden="true" className="size-4"/></Button></div>}
        {comparison.length > 0 && <section aria-label="Candidate comparison" className="mx-auto mt-8 w-full max-w-3xl border-t border-border pt-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Discovery comparison ({comparison.length}/3)</h3><Button variant="ghost" size="sm" onClick={() => updateComparison([])}>Clear comparison</Button></div><div className="mt-2 divide-y divide-border">{comparison.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-sm font-medium">{c.name}</span><span className="text-xs text-muted-foreground">Rank <span className="font-mono">{c.rank}</span>, consensus <span className="font-mono">{c.consensus.toFixed(3)}</span></span><Button variant="ghost" size="sm" aria-label={`Remove ${c.name}`} onClick={() => updateComparison(compared.filter(id => id !== c.id))}>Remove</Button></div>)}</div></section>}
      </section>
    </div>}
    <ProvenanceStrip provenance={data?.provenance}/>
  </div>;
}
