import { useEffect, useMemo, useState } from "react";
import { CaretUpDownIcon, CheckIcon, PillIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { api } from "@/api/client";
import { isMockMode } from "@/api/mock";
import { mockLookup, useProjectCandidates } from "@/api/mvpHooks";
import { useCandidates } from "@/api/hooks";
import type { Schema } from "@/api/types";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUi } from "@/store/ui";

/** Whole ranked pool (1,816 for GSE132903); the API caps the limit at 5,000. */
export const POOL_LIMIT = 5000;
/** Rendered matches per list; the full pool is searched, only this many rows are drawn. */
export const MAX_RENDERED = 100;

type PoolRow = Pick<Schema<"ProjectCandidate">, "id" | "name" | "rank" | "consensus">;
type Lookup = Schema<"LookupResult">;

const LOOKUP_STATUS: Record<Lookup["status"], string> = {
  ranked: "",
  not_rankable: "not rankable",
  not_in_lincs: "not in LINCS",
  unrecognized: "name not recognised",
};

const lookupCache = new Map<string, Promise<Lookup | null>>();

/** POST /lookup for one name, cached for the session (names do not change while the app runs). */
function lookupOne(name: string): Promise<Lookup | null> {
  const key = `${isMockMode() ? "mock" : "api"}:${name.toLowerCase()}`;
  let hit = lookupCache.get(key);
  if (!hit) {
    const input = { names: [name] };
    hit = (isMockMode()
      ? Promise.resolve(mockLookup(input))
      : api<Lookup[]>("/lookup", { method: "POST", body: JSON.stringify(input) })
    ).then((rows) => rows[0] ?? null);
    hit.catch(() => lookupCache.delete(key));
    lookupCache.set(key, hit);
  }
  return hit;
}

/** Current project's whole ranked pool, falling back to the frozen top list. */
export function useRankedPool() {
  const { currentProjectId } = useUi();
  const project = useProjectCandidates(currentProjectId ?? "GSE132903", { limit: POOL_LIMIT });
  const frozen = useCandidates();
  const list: PoolRow[] = project.data?.candidates ?? frozen.data?.candidates ?? [];
  const total = project.data?.n_ranked ?? list.length;
  return { list, total, frozen: frozen.data?.candidates ?? [] };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Search the whole ranked pool by name or BRD id (exact, then prefix, then substring; rank
 * order within each). With no local match and 3+ characters, ask POST /lookup so brand names
 * and synonyms resolve (Aricept to donepezil).
 */
export function useDrugSearch(query: string, allowLookup = true) {
  const { list, total } = useRankedPool();
  const q = query.trim().toLowerCase();
  const { matches, count } = useMemo(() => {
    if (!q) return { matches: list.slice(0, MAX_RENDERED), count: list.length };
    const scored: [number, PoolRow][] = [];
    for (const c of list) {
      const name = c.name.toLowerCase();
      const id = c.id.toLowerCase();
      const score = name === q || id === q ? 0 : name.startsWith(q) || id.startsWith(q) ? 1
        : name.includes(q) || id.includes(q) ? 2 : -1;
      if (score >= 0) scored.push([score, c]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank);
    return { matches: scored.slice(0, MAX_RENDERED).map(([, c]) => c), count: scored.length };
  }, [list, q]);
  // Lookup keeps the typed casing so the row reads "Aricept → Donepezil".
  const typed = query.trim();
  const debounced = useDebounced(typed, 250);
  const wantLookup = allowLookup && count === 0 && debounced.length >= 3 && debounced === typed;
  const [found, setFound] = useState<{ q: string; row: Lookup | null } | null>(null);
  useEffect(() => {
    if (!wantLookup) return;
    let live = true;
    lookupOne(debounced).then(
      (row) => live && setFound({ q: debounced, row }),
      () => live && setFound({ q: debounced, row: null }),
    );
    return () => {
      live = false;
    };
  }, [wantLookup, debounced]);
  const done = found?.q === debounced;
  const resolved = wantLookup && done ? found.row : null;
  return { matches, count, total, resolved, resolving: wantLookup && !done };
}

/** Result groups for a cmdk list with shouldFilter={false}; filtering happens in useDrugSearch. */
export function DrugSearchGroups({
  query,
  selectedId,
  onSelect,
  scope = "Ranked pool",
  quiet = false,
}: {
  query: string;
  /** Other groups already matched: skip the name lookup and the empty line. */
  quiet?: boolean;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  scope?: string;
}) {
  const { matches, count, total, resolved, resolving } = useDrugSearch(query, !quiet);
  return (
    <>
      {matches.length > 0 && (
        <CommandGroup heading={`${scope} · ${total.toLocaleString("en-US")}`}>
          {matches.map((c) => (
            <CommandItem key={c.id} value={c.id} onSelect={() => onSelect(c.id)} className="gap-2">
              <span className="w-10 shrink-0 font-mono text-[11px] text-ink-3">#{c.rank}</span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="font-mono text-[12px] text-primary">
                {typeof c.consensus === "number" ? c.consensus.toFixed(2) : ""}
              </span>
              <CheckIcon className={cn("size-3.5 shrink-0", c.id === selectedId ? "text-primary" : "invisible")} />
            </CommandItem>
          ))}
          {count > matches.length && (
            <div className="px-2 py-1.5 font-mono text-[11px] text-ink-3">
              {matches.length} of {count.toLocaleString("en-US")} shown
            </div>
          )}
        </CommandGroup>
      )}
      {resolved && (
        <CommandGroup heading="Name lookup">
          <CommandItem
            value={`lookup:${resolved.query}`}
            disabled={resolved.status !== "ranked" || !resolved.drug_id}
            onSelect={() => resolved.drug_id && onSelect(resolved.drug_id)}
            className="gap-2"
          >
            <span className="min-w-0 flex-1 truncate">
              {resolved.query}
              {resolved.name && (
                <>
                  {" → "}
                  <span className="font-medium text-ink">{resolved.name}</span>
                </>
              )}
            </span>
            {resolved.status === "ranked" && resolved.pool_rank != null ? (
              <span className="font-mono text-[12px] text-ink-3">#{resolved.pool_rank}</span>
            ) : (
              <span className="text-[12px] text-ink-3">{LOOKUP_STATUS[resolved.status]}</span>
            )}
          </CommandItem>
        </CommandGroup>
      )}
      {matches.length === 0 && !resolved && !quiet && (
        <div role="status" className="py-6 text-center text-sm text-ink-3">
          {resolving ? "Looking up name" : "No matching drug"}
        </div>
      )}
    </>
  );
}

/**
 * Pick the drug under investigation from any page. Searches the current project's whole
 * ranked pool by name or BRD id; unknown names go through the name lookup.
 */
export function CandidatePicker({
  variant = "bar",
  onPicked,
  className,
}: {
  /** "bar": compact chip for the top bar. "button": larger trigger for empty states. */
  variant?: "bar" | "button";
  onPicked?: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { selectedCandidateId, selectCandidate } = useUi();
  const { list, frozen } = useRankedPool();
  const selected =
    list.find((c) => c.id === selectedCandidateId) ?? frozen.find((c) => c.id === selectedCandidateId);
  const label = selected?.name ?? selectedCandidateId ?? "Choose drug";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        aria-label={selectedCandidateId ? `Selected candidate ${label}` : "Choose drug"}
        className={cn(
          variant === "bar"
            ? "flex h-8 shrink-0 items-center gap-2 rounded-full border border-rim/90 bg-frost/75 py-1 pr-3 pl-1.5 text-[13px] whitespace-nowrap shadow-[0_1px_2px_rgb(15_24_48/0.05)] backdrop-blur hover:bg-frost"
            : "flex h-11 min-w-72 items-center gap-2.5 rounded-full border border-ink/10 bg-frost px-4 text-[14px] shadow-[0_8px_24px_-12px_rgb(30_60_140/0.35)] hover:border-primary",
          className,
        )}
      >
        <PillIcon
          weight="fill"
          className={cn("shrink-0 rounded-full bg-accent-soft p-0.5 text-primary", variant === "bar" ? "size-5" : "size-6")}
        />
        <span className={cn("max-w-48 min-w-0 truncate", selected || selectedCandidateId ? "font-medium text-ink" : "text-ink-3")}>
          {label}
        </span>
        {selected && typeof selected.consensus === "number" && (
          <span className={cn("shrink-0 font-mono text-[12px] whitespace-nowrap text-ink-3", variant === "bar" && "hidden lg:inline")}>
            #{selected.rank} <span className="text-primary">{selected.consensus.toFixed(2)}</span>
          </span>
        )}
        <CaretUpDownIcon className="ml-auto size-4 shrink-0 text-ink-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 shadow-overlay">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search drug, brand or BRD id" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            <DrugSearchGroups
              query={query}
              selectedId={selectedCandidateId}
              onSelect={(id) => {
                selectCandidate(id);
                setOpen(false);
                setQuery("");
                onPicked?.(id);
              }}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
