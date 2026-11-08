/** Short definitions shown in tooltips. One or two lines each; no em or en dashes. */
export const GLOSSARY = {
  reversal:
    "Consensus of WTCS, KS and cosine scores. Negative reverses the AD signature.",
  contexts: "Cell line, dose and time combinations in the ranking split.",
  brainCells: "Ranking contexts measured in neural cell lines.",
  exposure: "Brain exposure evidence, labelled measured, curated or predicted.",
  approval:
    "Highest clinical stage (Open Targets 26.09). Withdrawn status from ChEMBL 37.",
  poolRank:
    "Rank among drugs at phase 1 or later, strongest reversal first.",
  hiddenTests:
    "Sealed held-out tests for this drug. Outcomes stay hidden until an experiment is committed.",
  attackReady: "Hidden tests exist, so Attack can run on this drug.",
  holmP: "p-value corrected for multiple comparisons (Holm).",
  coPrimary: "One of the two preregistered primary policies.",
  experimentsToVerdict:
    "Experiments a policy spends before its verdict first matches the full-information verdict. Fewer is better.",
  decisionAccuracy:
    "Share of runs whose verdict after the budget matches the verdict with every hidden test revealed.",
  undecided:
    "Candidates at INSUFFICIENT EVIDENCE before any test. The primary analysis set.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
