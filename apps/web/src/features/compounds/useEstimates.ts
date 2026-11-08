import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { isMockMode } from "@/api/mock";
import type { Schema } from "@/api/types";
// Copy of contracts/fixtures/estimateCompounds.json (the Docker web build only sees apps/web).
import fixture from "./estimateFixture.json";

export type Estimate = Schema<"CompoundEstimate">;

/** The API takes at most 50 ids per request. */
const CHUNK = 50;

export function mockEstimates(ids: string[]): Estimate[] {
  const table = fixture.estimates as Record<string, Omit<Estimate, "id" | "run_id">>;
  return ids.map((id) => {
    const entry = table[id];
    return entry
      ? { id, run_id: fixture.run_id, ...entry }
      : { id, run_id: fixture.run_id, estimate: null, basis: null, measured: null, status: "unknown_id" };
  });
}

async function fetchEstimates(ids: string[]): Promise<Map<string, Estimate>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const parts = await Promise.all(
    chunks.map((chunk) =>
      isMockMode()
        ? Promise.resolve(mockEstimates(chunk))
        : api<Estimate[]>("/compounds/estimate", {
            method: "POST",
            body: JSON.stringify({ ids: chunk }),
          }),
    ),
  );
  return new Map(parts.flat().map((e) => [e.id, e]));
}

/**
 * Exploratory structure-only estimates for the looked-up compounds. Display only: never
 * used for ranking. `show` is false when the model is not trained (409) or the request
 * fails, so the column is simply left out; no error is surfaced.
 */
export function useEstimates(results: { drug_id?: string | null }[]) {
  const ids = [...new Set(results.map((r) => r.drug_id).filter((id): id is string => !!id))];
  const query = useQuery({
    queryKey: ["compound-estimates", ids],
    queryFn: () => fetchEstimates(ids),
    enabled: ids.length > 0,
    retry: false,
    staleTime: Infinity,
    // Keep the column in place while a new list loads instead of hiding and re-showing it.
    placeholderData: keepPreviousData,
  });
  return {
    show: query.isSuccess,
    loading: query.isFetching,
    get: (id?: string | null) => (id ? query.data?.get(id) : undefined),
  };
}
