import type { Schema } from "@/api/types";

type Resource = Schema<"ResourceAgreement">;

/** Rank as a percentile of its own list (0 = top). Null unless ranked. */
export function rankPercentile(r?: Resource): number | null {
  if (!r || r.status !== "available" || r.rank == null || !r.n_ranked) return null;
  return (100 * (r.rank - 1)) / Math.max(1, r.n_ranked - 1);
}

/** LINCS and Perturb-Seqr ranks more than 50 percentile points apart. */
export function sourcesDisagree(rows: Resource[]) {
  const lincs = rows.find((r) => r.resource === "tauchstone_lincs_gold");
  const seqr = rows.find((r) => r.resource === "perturb_seqr");
  const a = rankPercentile(lincs);
  const b = rankPercentile(seqr);
  if (a == null || b == null || Math.abs(a - b) <= 50) return null;
  return { lincs: lincs!, seqr: seqr! };
}

