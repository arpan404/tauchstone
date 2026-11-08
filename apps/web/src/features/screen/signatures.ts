/** Built-in disease signatures a screen can start from. GSE173955 is the held-out cohort. */
export const SIGNATURES = [
  {
    id: "GSE132903",
    name: "middle temporal gyrus",
    method: "limma",
    meta: ["97 Alzheimer's", "98 control", "16,437 genes"],
    badge: { tone: "ok", label: "QC 7/7" },
    warning: null,
  },
  {
    id: "GSE173955",
    name: "hippocampus",
    method: "RNA-seq",
    meta: ["8 Alzheimer's", "10 control", "14,958 genes"],
    badge: { tone: "gap", label: "Held back for testing" },
    // QC fact (integrity log #6): quantile normalisation left 0 FDR genes. Not recomputed here.
    warning: {
      label: "Weak signature",
      detail: "No gene differs clearly between Alzheimer's and control once you correct for testing thousands of genes",
    },
  },
] as const;

/** The frozen, preregistered signature. Anything else is labelled `not preregistered`. */
export const FROZEN_SIGNATURE = "GSE132903";
