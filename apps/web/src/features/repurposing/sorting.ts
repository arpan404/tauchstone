import type { Schema } from "@/api/types";

type Candidate = Schema<"ProjectCandidate">;

/** Rows fetched per page; the API caps a request at 5000. */
export const PAGE = 100;
export const API_MAX = 5000;

export type SortKey = "rank" | "name" | "reversal" | "contexts";
export type Sort = { key: SortKey; dir: "asc" | "desc" };
export const DEFAULT_SORT: Sort = { key: "rank", dir: "asc" };
/** First click direction: strongest reversal and most contexts first. */
export const FIRST_DIR: Record<SortKey, Sort["dir"]> = {
  rank: "asc",
  name: "asc",
  reversal: "asc",
  contexts: "desc",
};

export function sortCandidates(rows: Candidate[], sort: Sort): Candidate[] {
  const value = (c: Candidate): number | string =>
    sort.key === "name"
      ? c.name.toLowerCase()
      : sort.key === "reversal"
        ? c.consensus
        : sort.key === "contexts"
          ? c.n_ranking_contexts
          : c.rank;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    const cmp =
      typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
    return cmp * sign || a.rank - b.rank;
  });
}

/** The project has no ranking yet: no screen id, a null count, or the API says so. */
export function isNotScreened(
  data: { screen_id?: string | null; n_ranked?: number | null } | undefined,
  error: unknown,
) {
  if (error instanceof Error && /not screened|: 409$/i.test(error.message)) return true;
  if (!data) return false;
  return data.n_ranked == null || data.screen_id === null;
}

