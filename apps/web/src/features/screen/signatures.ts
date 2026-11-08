/** Built-in disease signatures a screen can start from. GSE173955 is the held-out cohort. */
export const SIGNATURES = [
  {
    id: "GSE132903",
    name: "middle temporal gyrus",
    method: "limma",
    meta: ["97 AD", "98 control", "16,437 genes"],
    badge: { tone: "ok", label: "QC 7/7" },
  },
  {
    id: "GSE173955",
    name: "hippocampus",
    method: "RNA-seq",
    meta: ["8 AD", "10 control", "14,958 genes"],
    badge: { tone: "gap", label: "held-out" },
  },
] as const;

/** The frozen, preregistered signature. Anything else is labelled `not preregistered`. */
export const FROZEN_SIGNATURE = "GSE132903";
