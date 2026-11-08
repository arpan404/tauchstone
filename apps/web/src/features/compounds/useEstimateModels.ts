import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { isMockMode } from "@/api/mock";
import type { Schema } from "@/api/types";
// Copy of contracts/fixtures/getEstimateModels.json (the Docker web build only sees apps/web).
import fixture from "./estimateModelsFixture.json";

export type EstimateModels = Schema<"EstimateModels">;

export const MOCK_MODELS = fixture as EstimateModels;

/** Stored comparison of the structure models behind the AI estimate. Fetched only when asked for. */
export function useEstimateModels(enabled: boolean) {
  return useQuery({
    queryKey: ["estimate-models"],
    queryFn: () =>
      isMockMode() ? Promise.resolve(MOCK_MODELS) : api<EstimateModels>("/compounds/estimate/models"),
    enabled,
    retry: false,
    staleTime: Infinity,
  });
}
