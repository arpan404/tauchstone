/**
 * Plain-language meaning of every badge label in the app, shown as a hover tooltip.
 * Sources: data/manifests/preregistration.yaml, processed/signatures/*__qc.md (sign check),
 * docs/integrity_log.md, ChEMBL / Open Targets fields. Wording follows AGENTS.md (no clinical claims).
 */
const EXPOSURE_KEY = "measured = experimental data, curated = from literature databases, predicted = model estimate.";

// Structure-only AI estimate (My compounds). Numbers: scaffold-grouped internal test, n = 1,123,
// MAE 0.472 vs 0.481 for the training mean, R2 0.023, Spearman 0.18 (docs/integrity_log.md).
const ESTIMATE_KEY =
  "Estimated from chemical structure alone by a random forest: a guess at the LINCS reversal score, not evidence about Alzheimer's. On structures it had not seen it is barely better than guessing the average: on average it lands 0.47 from the real score, versus 0.48 for always guessing the mean (rank correlation 0.18). Never used for ranking or for any hidden test.";

const EXACT: Record<string, string> = {
  "not preregistered":
    "Exploratory. Before any results were seen, only the GSE132903 ranking and its hidden tests were fixed in writing (preregistration 21f7460e). This is outside that plan.",
  preregistered:
    "Part of the analysis fixed in writing before any results were seen (preregistration 21f7460e), so it could not be tuned to the outcome.",
  "held-out":
    "Held back for testing in Attack. Never used to build the ranking, set thresholds or choose drugs.",
  "held back for testing":
    "Held back for testing in Attack. Never used to build the ranking, set thresholds or choose drugs.",
  "hidden test":
    "Held back for testing in Attack. Never used to build the ranking, set thresholds or choose drugs.",
  "weak signature":
    "No gene reaches FDR < 0.05 in this cohort after normalisation, and only 5 of 7 marker genes move the expected way. Rankings from it carry little signal.",
  "report only":
    "Shown for comparison only. Outside resources never change the ranking, the hidden tests or the verdict.",
  "sources disagree":
    "This drug ranks very differently in the outside resources than in our LINCS ranking. They use different drug libraries and assays.",
  illustration: "Animation of screen progress. It does not show the data.",
  "co-primary": "One of the two main strategies named in the preregistration. Both are reported whatever the result.",
  primary: "One of the two main strategies named in the preregistration. Both are reported whatever the result.",
  descriptive: "Shown for context. Not one of the preregistered statistical tests.",
  "retrospective benchmark":
    "Replay of the test-picking strategies on 50 drugs whose hidden outcomes were fixed in advance. It measures how well each strategy picks tests, not the drugs.",
  "replay on 50 drugs":
    "Replay of the test-picking strategies on 50 drugs whose hidden outcomes were fixed in advance. It measures how well each strategy picks tests, not the drugs.",
  "frozen run": "The original preregistered GSE132903 screen. Running a new screen never replaces it.",
  "original run": "The original preregistered GSE132903 screen. Running a new screen never replaces it.",
  ranked: "In this project's LINCS ranking, with a rank and a reversal score.",
  "not rankable": "In LINCS, but measured in fewer than 3 conditions, too few to rank.",
  "not in lincs": "A known compound, but LINCS L1000 has no signatures for it.",
  "name not recognised": "No compound with this name or brand name was found.",
  "cancer lines only": "Every LINCS measurement for this drug comes from cancer cell lines, none from neural cells.",
  "no brain-cell data": "No LINCS measurement for this drug comes from a neural cell line.",
  "no recorded targets": "No known molecular target in ChEMBL or Open Targets.",
  "neural-line ranking data": "At least one ranking condition uses a neural cell line (for example NEU or NPC).",
  "no neural-line ranking data": "No ranking condition uses a neural cell line; all are other cell types.",
  "neural cell line data": "At least one ranking condition uses a neural cell line (for example NEU or NPC).",
  "no neural cell line data": "No ranking condition uses a neural cell line; all are other cell types.",
  "brain-cell data": "Has LINCS measurements in neural cell lines, not only in cancer lines.",
  neural: "Has LINCS measurements in neural cell lines, not only in cancer lines.",
  survived: "This hidden test passed its preregistered rule, so the chance the claim holds goes up.",
  passed: "This hidden test passed its preregistered rule, so the chance the claim holds goes up.",
  failed: "This hidden test did not pass its preregistered rule, so the chance the claim holds goes down.",
  "supported so far":
    "The chance the claim holds is 0.8 or more, given the tests shown so far. More tests could still lower it.",
  "fragile / context-dependent":
    "The chance the claim holds is 0.2 or less. The reversal likely depends on the conditions it was measured in.",
  "insufficient evidence": "The chance the claim holds is between 0.2 and 0.8. Not enough tests to call it either way.",
  recommended: "The test the current strategy would run next. You can pick any hidden test instead.",
  suggested: "The test the current strategy would run next. You can pick any hidden test instead.",
  "earlier pick": "Suggested under the previous setting. A new suggestion appears after the next result.",
  ready: "Ready to screen.",
  scoring: "Scoring LINCS signatures against the disease signature now.",
  done: "Screen finished. The ranking is ready in Candidates.",
  provisional: "Partial ranking while the screen runs. Final ranks appear when it finishes.",
  "synthetic data": "Showing built-in example data, not real results.",
  approved: "Approved for at least one indication (ChEMBL). Approval says nothing about Alzheimer's.",
  investigational: "Has reached clinical trials but is not approved for any indication.",
  "ai estimate": `${ESTIMATE_KEY} "In training data" means the model saw this compound while training, so its estimate looks better than it really is.`,
  "held out": `The model never saw this structure family while training. ${ESTIMATE_KEY}`,
  "held out from training": `The model never saw this structure family while training. ${ESTIMATE_KEY}`,
  "in training": `The model saw this compound (or an identical structure) while training, so its estimate looks better than it really is. ${ESTIMATE_KEY}`,
  "in training data": `The model saw this compound (or an identical structure) while training, so its estimate looks better than it really is. ${ESTIMATE_KEY}`,
  "new structure": `Not scored in the discovery ranking; the model estimated it fresh from its structure. ${ESTIMATE_KEY}`,
  "target context": "A protein structure of the drug's target, shown for orientation. It is not evidence that the drug binds.",
};

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^qc (\d+)\/(\d+)$/, (m) =>
    `Sign check: ${m[1]} of ${m[2]} known Alzheimer's marker genes move the expected way (GFAP, CD44, SERPINA3 up; SST, VGF, NPTX2, BDNF down).`],
  [/^approved\s*·?\s*phase (\d+)/, (m) =>
    `Highest clinical trial phase in ChEMBL: phase ${m[1]}${m[1] === "4" ? " (approved for at least one indication)" : ""}.`],
  [/^phase (\d+)/, (m) => `Highest clinical trial phase reached in ChEMBL: phase ${m[1]}.`],
  [/^brain exposure\s*[·:]?\s*(measured|curated|predicted)\s*(.*)$/, (m) =>
    `Brain exposure is ${m[1]} ${m[2] ? `as "${m[2]}"` : ""}. ${EXPOSURE_KEY}`],
  [/^(measured|curated|predicted) (low|penetrant|high).*$/, (m) =>
    `Brain exposure, ${m[1]}: ${m[2] === "low" ? "unlikely to reach the brain" : "expected to reach the brain"}. ${EXPOSURE_KEY}`],
  [/^no predicted data$/, () => "No measured, curated or predicted brain-exposure value is available."],
  [/^brain-cell data\s*·?\s*(\S+)/, (m) => `Reversal score in the neural cell line ${m[1]}, not only in cancer lines.`],
  [/^([\d.]+)\s*µm only$/, (m) => `Measured at one concentration only (${m[1]} µM), no concentration range.`],
  [/µm$/, () => "Concentrations at which LINCS measured this drug."],
  [/^([\d.]+)\s*h only$/, (m) => `Measured at one time point only (${m[1]} h), a short exposure.`],
  [/^[\d., ]+\s*h$/, () => "Time points at which LINCS measured this drug."],
  [/^(pool |clinical-stage )?rank \d+/, () => "Rank among the scored drugs at clinical phase 1 or later. 1 pushes genes most strongly opposite to Alzheimer's."],
  [/^reversal( score)? -?[\d.]+/, () => "Reversal score: average of the z-scored WTCS, KS and cosine match scores. Negative means the drug pushes gene expression opposite to Alzheimer's."],
];

/** Meaning of a badge label, or null when the label is not in the glossary. */
export function badgeTip(label: string): string | null {
  const key = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  if (EXACT[key]) return EXACT[key];
  for (const [re, fn] of RULES) {
    const m = key.match(re);
    if (m) return fn(m).replace(/\s+/g, " ").trim();
  }
  return null;
}
