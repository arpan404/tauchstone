import { expect, it } from "vitest";
import { rankPercentile, sourcesDisagree } from "./agreement";

const lincs = { resource: "tauchstone_lincs_gold", status: "available", rank: 1, n_ranked: 1816 } as const;

it("flags LINCS and Perturb-Seqr ranks more than 50 percentile points apart", () => {
  expect(rankPercentile(lincs)).toBe(0);
  const far = { resource: "perturb_seqr", status: "available", rank: 900, n_ranked: 1000 } as const;
  const near = { resource: "perturb_seqr", status: "available", rank: 400, n_ranked: 1000 } as const;
  expect(sourcesDisagree([lincs, far])?.seqr.rank).toBe(900);
  expect(sourcesDisagree([lincs, near])).toBeNull();
  expect(sourcesDisagree([lincs, { resource: "perturb_seqr", status: "not_found" }])).toBeNull();
});
