/** Short definitions shown in tooltips. One or two lines each; no em or en dashes. */
export const GLOSSARY = {
  reversal:
    "Average of three standard match scores (WTCS, KS and cosine, each z-scored) between the drug's LINCS response and the Alzheimer's signature. Negative means the drug pushes genes the opposite way to Alzheimer's.",
  contexts: "LINCS test conditions: one cell line at one concentration and one time point. These are the conditions used for ranking.",
  brainCells: "Ranking conditions measured in neural cell lines, not cancer lines.",
  exposure: "Evidence that the drug reaches the brain, labelled measured, curated or predicted.",
  approval:
    "Highest clinical trial phase reached (Open Targets 26.09). Withdrawn status from ChEMBL 37.",
  poolRank:
    "Rank among the scored drugs at clinical phase 1 or later. 1 pushes genes most strongly opposite to Alzheimer's.",
  hiddenTests:
    "Tests on evidence kept out of the ranking: another cohort, a cell-mix adjusted signature, held-back LINCS conditions and brain-exposure data. Results stay hidden until you run a test in Attack.",
  attackReady: "Has hidden tests, so it can be tested in Attack.",
  holmP: "p-value adjusted for the 10 comparisons with the Holm method.",
  coPrimary: "One of the two strategies named as the main comparison before any results were seen (preregistration).",
  experimentsToVerdict:
    "Tests a strategy runs before its verdict first matches the verdict with every hidden test shown. Fewer is better.",
  decisionAccuracy:
    "Share of runs whose verdict after the test budget matches the verdict with every hidden test shown.",
  undecided:
    "Drugs at INSUFFICIENT EVIDENCE before any test is run. This is the main analysis set.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
