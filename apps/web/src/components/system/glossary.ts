/** Short definitions shown in tooltips. Plain words, one or two lines each; no em or en dashes. */
export const GLOSSARY = {
  reversal:
    "How strongly the drug pushes gene activity opposite to Alzheimer's. It averages three standard ways of comparing the drug's gene response with the Alzheimer's signature. Negative means opposite; the more negative, the stronger.",
  contexts: "A lab condition in the LINCS drug-response database: one cell line, one concentration, one time point.",
  brainCells: "Measurements made in nerve-like cell lines rather than cancer cells.",
  exposure:
    "Evidence that the drug gets into the brain, labelled measured (from experiments), curated (from published databases) or predicted (from a computer model).",
  approval: "Furthest stage of clinical trials reached (Open Targets), and whether it was ever withdrawn (ChEMBL).",
  poolRank:
    "Position among the scored drugs that have reached clinical trials. Rank 1 pushes gene activity most strongly opposite to Alzheimer's.",
  hiddenTests:
    "Checks the ranking never saw: another group of patients, a version corrected for cell loss, held-back lab conditions and brain-exposure data. Each result stays sealed until you run it on the Attack page.",
  attackReady: "Has hidden checks set up, so it can be tested on the Attack page.",
  holmP: "p-value corrected for making 10 comparisons at once (Holm method), so a lucky result is less likely to look real.",
  coPrimary: "One of the two test-picking strategies named in advance as the main comparison.",
  experimentsToVerdict:
    "How many tests a strategy needs before it reaches the verdict it would reach with every test run. Fewer is better.",
  decisionAccuracy:
    "How often a strategy's verdict, after using its test budget, matches the verdict with every test run.",
  undecided: "Drugs that start at INSUFFICIENT EVIDENCE before any test is run. The main analysis looks at these.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
