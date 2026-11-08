import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { isMockMode } from "@/api/mock";

/** Subset of GET /lab/model that this page reads. The route is not in the OpenAPI contract. */
export type StructureModel = {
  status: "not_trained" | "training" | "ready" | "failed";
  report?: {
    run_id: string;
    n_test: number;
    feature_count: number;
    metrics: { mae?: number | null; baseline_mae?: number | null; r2?: number | null; spearman?: number | null };
    limitations: string[];
  };
};

/** Offline demo value: the stored run's numbers, with a mock run id. */
export const MOCK_MODEL: StructureModel = {
  status: "ready",
  report: {
    run_id: "MOCK-structure-model",
    n_test: 1123,
    feature_count: 1024,
    metrics: { mae: 0.47204, baseline_mae: 0.48150, r2: 0.02311, spearman: 0.17951 },
    limitations: [
      "Exploratory chemical generalization only; no clinical interpretation.",
      "Predicts discovery reversal scores, not independent biological evidence.",
      "One internal scaffold split; no hyperparameter search or external validation.",
      "Does not replace official rankings or the preregistered benchmark.",
    ],
  },
};

/** Status and test numbers of the structure-only model. Fetched only when asked for. */
export function useStructureModel(enabled: boolean) {
  return useQuery({
    queryKey: ["structure-model"],
    queryFn: () => (isMockMode() ? Promise.resolve(MOCK_MODEL) : api<StructureModel>("/lab/model")),
    enabled,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "training" ? 5000 : false),
  });
}
