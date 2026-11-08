import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { isMockMode } from "./mock";
import type { operations } from "./schema";
import type { Schema } from "./types";
import piperacillinMolecule from "@/features/molecule/__fixtures__/piperacillin.BRD-K86873305.json";

export type CandidateFilters = NonNullable<
  operations["listProjectCandidates"]["parameters"]["query"]
>;
export type LookupInput =
  operations["lookupCompounds"]["requestBody"]["content"]["application/json"];

// Display fixtures only. IDs are explicitly mock IDs, never presented as LINCS IDs.
const rows: [string, number, number, boolean, boolean, boolean][] = [
  ["Ticrynafen", -2.32, 4, true, false, true],
  ["Nepafenac", -2.03, 3, true, false, true],
  ["Cholic acid", -1.82, 13, true, true, false],
  ["Bavisant", -1.81, 5, false, false, true],
  ["Piperacillin", -1.79, 3, true, false, false],
  ["Busulfan", -1.79, 5, true, false, false],
  ["LY-2886721", -1.77, 5, false, false, true],
  ["Cefotetan", -1.76, 7, true, false, false],
  ["Enobosarm", -1.71, 8, false, false, false],
  ["CPI-1189", -1.68, 6, false, false, true],
  ["Granisetron", -1.68, 3, true, false, true],
  ["Brinzolamide", -1.67, 3, true, false, false],
];
export const mvpCandidates: Schema<"ProjectCandidate">[] = rows.map(
  ([name, consensus, contexts, approved, brain, penetrant], i) => ({
    id: `MOCK-${String(i + 1).padStart(4, "0")}`,
    name,
    rank: i + 1,
    consensus,
    consensus_iqr: [],
    scores: { wtcs: consensus, ks: consensus, cosine: consensus },
    n_ranking_contexts: contexts,
    by_cell_line: brain
      ? [{ cell_id: "NEU", consensus: -0.66, n_contexts: 1 }]
      : [],
    approval_status: { status: approved ? "approved" : "investigational" },
    brain_cells: brain,
    penetrant,
    exposure_label: penetrant ? "predicted penetrant" : "predicted low",
    attack_ready: true,
    preregistered: true,
  }),
);
export function mockProjectCandidates(
  projectId: string,
  filters: CandidateFilters = {},
): Schema<"ProjectCandidates"> {
  const eligible = mvpCandidates.filter(
    (c) =>
      (filters.approved === undefined ||
        (c.approval_status?.status === "approved") === filters.approved) &&
      (filters.brain_cells === undefined ||
        c.brain_cells === filters.brain_cells) &&
      (filters.penetrant === undefined || c.penetrant === filters.penetrant) &&
      c.n_ranking_contexts >= (filters.min_contexts ?? 0),
  );
  return {
    project_id: projectId,
    n_ranked: 1816,
    n_total_eligible: eligible.length,
    preregistered: true,
    candidates: eligible.slice(0, filters.limit ?? 50),
  };
}
export function mockDrug(id: string): Schema<"DrugDetail"> {
  const candidate = mvpCandidates.find(
    (c) => c.id === id || c.name.toLowerCase() === id.toLowerCase(),
  );
  if (!candidate) throw new Error("Drug not found");
  const piperacillin = candidate.name === "Piperacillin";
  return {
    drug_id: candidate.id,
    name: candidate.name,
    pool_rank: candidate.rank,
    rank_total: 1816,
    consensus: candidate.consensus,
    n_contexts: candidate.n_ranking_contexts,
    approval_status: candidate.approval_status,
    targets: [],
    structure: null,
    molecule: piperacillin ? (piperacillinMolecule as Schema<"Molecule3D">) : null,
    gaps: {
      brain_cells: candidate.brain_cells
        ? [{ cell_id: "NEU", consensus: -0.66, below_theta: false }]
        : [],
      cancer_lines_only: piperacillin,
      doses_um: piperacillin ? [10] : [],
      times_h: piperacillin ? [6] : [],
      exposure: {
        level: "predicted",
        label: candidate.exposure_label ?? "unspecified",
      },
      has_targets: false,
    },
    contexts: piperacillin
      ? ["HT29", "MCF7", "VCAP"].map((cell_id) => ({
          cell_id,
          dose: "10 uM",
          time: "6 h",
          consensus: -1.79,
        }))
      : candidate.by_cell_line.map((c) => ({
          cell_id: c.cell_id,
          dose: "unspecified",
          time: "unspecified",
          consensus: c.consensus,
          neural: true,
        })),
    n_hidden_tests: piperacillin ? 3 : null,
    attack_ready: true,
    preregistered: true,
  };
}
export function mockDrugResources(id: string): Schema<"ResourceAgreement">[] {
  const drug = mockDrug(id);
  return [
    {
      resource: "tauchstone_lincs_gold",
      status: "available",
      rank: drug.pool_rank,
      n_ranked: 1816,
    },
    { resource: "clue", status: "needs_key" },
    { resource: "perturb_seqr", status: "not_available" },
  ];
}
export function mockLookup({ names }: LookupInput): Schema<"LookupResult">[] {
  const known: Record<string, [number, number, number]> = {
    donepezil: [684, -0.24, 6],
    memantine: [502, -0.36, 4],
    galantamine: [1214, 0.21, 4],
  };
  return names.map((query) => {
    const normalized = query.trim().toLowerCase();
    const candidate = mvpCandidates.find(
      (c) => c.name.toLowerCase() === normalized,
    );
    const entry = known[normalized];
    if (candidate || entry)
      return {
        query,
        name: candidate?.name ?? query,
        status: "ranked",
        drug_id: candidate?.id ?? `MOCK-LOOKUP-${normalized}`,
        pool_rank: candidate?.rank ?? entry![0],
        rank_total: 1816,
        consensus: candidate?.consensus ?? entry![1],
        n_contexts: candidate?.n_ranking_contexts ?? entry![2],
        attack_ready: candidate?.attack_ready ?? false,
        preregistered: false,
      };
    return {
      query,
      status: normalized === "rivastigmine" ? "not_rankable" : "not_in_lincs",
      attack_ready: false,
      preregistered: false,
    };
  });
}
export type CompoundMatch = Schema<"CompoundMatch">;

/** Same key as the API: lowercase, non-alphanumerics stripped. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Web mock rows, consistent with mockLookup (each name looks up to the same status).
const mockSearchRows: (CompoundMatch & { aliases?: string[] })[] = [
  ...mvpCandidates.map((c) => ({
    id: c.id,
    name: c.name,
    status: "ranked" as const,
    pool_rank: c.rank,
    rank_total: 1816,
    consensus: c.consensus,
  })),
  { id: "MOCK-LOOKUP-memantine", name: "Memantine", status: "ranked", pool_rank: 502, rank_total: 1816, consensus: -0.36 },
  { id: "MOCK-LOOKUP-donepezil", name: "Donepezil", status: "ranked", pool_rank: 684, rank_total: 1816, consensus: -0.24, aliases: ["Aricept"] },
  { id: "MOCK-LOOKUP-galantamine", name: "Galantamine", status: "ranked", pool_rank: 1214, rank_total: 1816, consensus: 0.21 },
  { id: "MOCK-LOOKUP-rivastigmine", name: "Rivastigmine", status: "not_rankable" },
  { id: "MOCK-CHEMBL-lithium", name: "Lithium", status: "not_in_lincs" },
];
const STATUS_ORDER: Record<CompoundMatch["status"], number> = { ranked: 0, not_rankable: 1, not_in_lincs: 2 };

const BRD_CODE = /^BRD-[A-Z]\d/i;

/** Mirrors GET /compounds/search: exact, prefix, substring (3+); named before bare BRD codes, ranked first in rank order. */
export function mockCompoundSearch(q: string, limit = 20): CompoundMatch[] {
  const nq = normalizeName(q);
  if (!nq) return [];
  const scored: [number, CompoundMatch][] = [];
  for (const { aliases = [], ...row } of mockSearchRows) {
    let best: [number, string | undefined] | null = null;
    for (const [label, alias] of [[row.name, undefined], ...aliases.map((a) => [a, a])] as [string, string | undefined][]) {
      const key = normalizeName(label);
      const tier = key === nq ? 0 : key.startsWith(nq) ? 1 : nq.length >= 3 && key.includes(nq) ? 2 : -1;
      if (tier >= 0 && (!best || tier < best[0])) best = [tier, alias];
    }
    if (best) scored.push([best[0], best[1] ? { ...row, matched_alias: best[1] } : row]);
  }
  scored.sort(
    ([ta, a], [tb, b]) =>
      ta - tb ||
      Number(BRD_CODE.test(a.name)) - Number(BRD_CODE.test(b.name)) ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.pool_rank ?? 0) - (b.pool_rank ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return scored.slice(0, limit).map(([, row]) => row);
}

/** GET /compounds/search for the picker; previous matches stay while the next query loads. */
export function useCompoundSearch(query: string, limit = 20) {
  const q = query.trim();
  return useQuery({
    queryKey: ["compound-search", q, limit],
    enabled: normalizeName(q).length > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    queryFn: () =>
      isMockMode()
        ? Promise.resolve(mockCompoundSearch(q, limit))
        : api<CompoundMatch[]>(`/compounds/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  });
}
export function useProjectCandidates(
  projectId: string | null,
  filters: CandidateFilters = {},
) {
  return useQuery({
    queryKey: ["project-candidates", projectId, filters],
    enabled: !!projectId,
    queryFn: () => {
      if (!projectId) throw new Error("No project selected");
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters))
        if (value !== undefined) params.set(key, String(value));
      return isMockMode()
        ? Promise.resolve(mockProjectCandidates(projectId, filters))
        : projectCandidates(projectId, params);
    },
    // An unscreened project is a state, not a transient failure.
    retry: (count, error) =>
      (error as { status?: number }).status !== 409 && count < 2,
  });
}
/** Error raised for a project with no screen yet (HTTP 409, detail 'Project not screened'). */
export class NotScreenedError extends Error {
  status = 409;
  constructor() {
    super("Project not screened");
    this.name = "NotScreenedError";
  }
}
async function projectCandidates(projectId: string, params: URLSearchParams) {
  const path = `/projects/${encodeURIComponent(projectId)}/candidates?${params}`;
  const res = await fetch(`/api${path}`);
  if (res.status === 409) throw new NotScreenedError();
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<Schema<"ProjectCandidates">>;
}
export function useDrug(drugId: string | null, projectId?: string) {
  return useQuery({
    queryKey: ["drug", drugId, projectId],
    enabled: !!drugId,
    queryFn: () => {
      if (!drugId) throw new Error("No drug selected");
      return isMockMode()
        ? Promise.resolve(mockDrug(drugId))
        : api<Schema<"DrugDetail">>(
            `/drugs/${encodeURIComponent(drugId)}${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`,
          );
    },
  });
}
export function useDrugResources(drugId: string | null) {
  return useQuery({
    queryKey: ["drug-resources", drugId],
    enabled: !!drugId,
    queryFn: () => {
      if (!drugId) throw new Error("No drug selected");
      return isMockMode()
        ? Promise.resolve(mockDrugResources(drugId))
        : api<Schema<"ResourceAgreement">[]>(
            `/drugs/${encodeURIComponent(drugId)}/resources`,
          );
    },
  });
}
export function useLookup() {
  return useMutation({
    mutationFn: (input: LookupInput) =>
      isMockMode()
        ? Promise.resolve(mockLookup(input))
        : api<Schema<"LookupResult">[]>("/lookup", {
            method: "POST",
            body: JSON.stringify(input),
          }),
  });
}
