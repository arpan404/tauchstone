/**
 * Plain-language meaning of every badge label in the app, shown as a hover tooltip.
 * Sources: data/manifests/preregistration.yaml, processed/signatures/*__qc.md (sign check),
 * docs/integrity_log.md, ChEMBL / Open Targets fields. Wording follows AGENTS.md (no clinical claims).
 */
const EXPOSURE_KEY = "Measured means from experiments, curated means from published databases, predicted means from a computer model.";

// Structure-only AI estimate (My compounds). Numbers: scaffold-grouped internal test, n = 1,123,
// MAE 0.472 vs 0.481 for the training mean, R2 0.023, Spearman 0.18 (docs/integrity_log.md).
const ESTIMATE_KEY =
  "A machine-learning guess (a random forest model) at this drug's reversal score from its chemical structure alone. It is barely better than guessing the average: on structures it had not seen it is typically off by 0.47, versus 0.48 for always guessing the mean (rank correlation 0.18). Never used for ranking or for any hidden test, and says nothing about Alzheimer's on its own.";

const EXACT: Record<string, string> = {
  exploratory:
    "Exploratory. Our main analysis was written down and locked before we saw any results, so it could not be tuned to look good. This part was not in that locked plan, so read it as a lead to follow up, not a finding.",
  "not preregistered":
    "Exploratory. Our main analysis was written down and locked before we saw any results, so it could not be tuned to look good. This part was not in that locked plan, so read it as a lead to follow up, not a finding.",
  preregistered:
    "Part of our main analysis, written down and locked before we saw any results, so it could not be tuned to look good.",
  "held-out":
    "Kept aside to test drugs on the Attack page. Never used to build the ranking, set any cut-off or choose which drugs to show.",
  "held back for testing":
    "Kept aside to test drugs on the Attack page. Never used to build the ranking, set any cut-off or choose which drugs to show.",
  "hidden test":
    "Kept aside to test drugs on the Attack page. Never used to build the ranking, set any cut-off or choose which drugs to show.",
  "weak signature":
    "In this cohort no single gene differs clearly between Alzheimer's and control once you correct for testing thousands of genes, and only 5 of 7 known Alzheimer's genes move the expected way. Rankings built on it carry little signal.",
  "report only":
    "Shown for comparison only. These outside databases never change our ranking, the hidden tests or any verdict.",
  "sources disagree":
    "Other drug-response databases rank this drug very differently from ours. They test different sets of drugs in different ways, so disagreement is common.",
  illustration: "Animation of screen progress. It does not show the data.",
  "co-primary": "One of the two test-picking strategies named in advance as the main comparison. Both are reported, whatever the result.",
  primary: "One of the two test-picking strategies named in advance as the main comparison. Both are reported, whatever the result.",
  descriptive: "Shown for context only. Not one of the statistical tests committed to in advance.",
  "retrospective benchmark":
    "Each test-picking strategy replayed on 50 drugs whose hidden results were fixed in advance. It scores how well a strategy chooses tests, not how good the drugs are.",
  "replay on 50 drugs":
    "Each test-picking strategy replayed on 50 drugs whose hidden results were fixed in advance. It scores how well a strategy chooses tests, not how good the drugs are.",
  "frozen run": "The original screen of the main study. Running a new screen never replaces it.",
  "original run": "The original screen of the main study. Running a new screen never replaces it.",
  ranked: "Scored and ranked in this project, with a rank and a reversal score.",
  "not rankable": "In the LINCS drug-response database, but measured in fewer than 3 lab conditions, too few to rank reliably.",
  "not in lincs": "A known compound, but the LINCS drug-response database has no measurements for it.",
  "name not recognised": "No compound with this name or brand name was found.",
  "cancer lines only": "Every lab measurement of this drug comes from cancer cells, none from nerve-like cells.",
  "no brain-cell data": "None of this drug's lab measurements come from nerve-like cells.",
  "no recorded targets": "No known protein target in the public drug databases (ChEMBL, Open Targets).",
  "neural-line ranking data": "At least one measurement used for ranking comes from nerve-like cells (the NEU or NPC lines).",
  "no neural-line ranking data": "None of the measurements used for ranking come from nerve-like cells.",
  "neural cell line data": "At least one measurement used for ranking comes from nerve-like cells (the NEU or NPC lines).",
  "no neural cell line data": "None of the measurements used for ranking come from nerve-like cells.",
  "brain-cell data": "Has lab measurements in nerve-like cells, not only in cancer cells.",
  neural: "Has lab measurements in nerve-like cells, not only in cancer cells.",
  survived: "This hidden test met the pass rule set in advance, so the chance the claim holds went up.",
  passed: "This hidden test met the pass rule set in advance, so the chance the claim holds went up.",
  failed: "This hidden test missed the pass rule set in advance, so the chance the claim holds went down.",
  "supported so far":
    "The chance the claim holds is 80% or more after the tests run so far. More tests could still lower it.",
  "fragile / context-dependent":
    "The chance the claim holds is 20% or less. The effect probably depends on the conditions it was measured in.",
  "insufficient evidence": "The chance the claim holds is between 20% and 80%. Not enough evidence yet to call it either way.",
  recommended: "The test the current strategy would run next. You can pick any hidden test instead.",
  suggested: "The test the current strategy would run next. You can pick any hidden test instead.",
  "earlier pick": "Suggested before the last result. A new suggestion appears after the next test.",
  ready: "Ready to screen.",
  scoring: "Comparing the Alzheimer's signature with every LINCS drug measurement now.",
  done: "Screen finished. The ranking is ready in Candidates.",
  provisional: "Partial ranking while the screen runs. Final ranks appear when it finishes.",
  "synthetic data": "Showing built-in example data, not real results.",
  approved: "Approved for at least one condition somewhere (ChEMBL). Says nothing about Alzheimer's.",
  investigational: "Has been in clinical trials but is not approved for any condition.",
  "ai estimate": `${ESTIMATE_KEY} "In training data" means the model saw this compound while training, so its estimate looks better than it really is.`,
  "held out": `The model never saw this structure family while training. ${ESTIMATE_KEY}`,
  "held out from training": `The model never saw this structure family while training. ${ESTIMATE_KEY}`,
  "in training": `The model saw this compound (or an identical structure) while training, so its estimate looks better than it really is. ${ESTIMATE_KEY}`,
  "in training data": `The model saw this compound (or an identical structure) while training, so its estimate looks better than it really is. ${ESTIMATE_KEY}`,
  "new structure": `Not in the main ranking, so the model estimated it fresh from its structure. ${ESTIMATE_KEY}`,
  "target context": "A 3D structure of the protein this drug is known to act on, shown for orientation. It is not evidence that the drug binds to it.",
};

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^qc (\d+)\/(\d+)$/, (m) =>
    `Sign check: ${m[1]} of ${m[2]} known Alzheimer's marker genes move the expected way (GFAP, CD44, SERPINA3 up; SST, VGF, NPTX2, BDNF down).`],
  [/^approved\s*·?\s*phase (\d+)/, (m) =>
    `Furthest clinical trial phase reached (ChEMBL): phase ${m[1]}${m[1] === "4" ? ", approved for at least one condition" : ""}.`],
  [/^phase (\d+)/, (m) => `Furthest clinical trial phase reached (ChEMBL): phase ${m[1]}.`],
  [/^brain exposure\s*[·:]?\s*(measured|curated|predicted)\s*(.*)$/, (m) =>
    `Brain exposure is ${m[1]} ${m[2] ? `as "${m[2]}"` : ""}. ${EXPOSURE_KEY}`],
  [/^(measured|curated|predicted) (low|penetrant|high).*$/, (m) =>
    `Brain exposure, ${m[1]}: ${m[2] === "low" ? "unlikely to reach the brain" : "expected to reach the brain"}. ${EXPOSURE_KEY}`],
  [/^no predicted data$/, () => "No data on whether this drug gets into the brain: nothing measured, curated or predicted."],
  [/^brain-cell data\s*·?\s*(\S+)/, (m) => `Reversal score measured in the nerve-like cell line ${m[1]}, not only in cancer cells.`],
  [/^([\d.]+)\s*µm only$/, (m) => `Measured at one concentration only (${m[1]} µM), so there is no way to see how the effect changes with amount.`],
  [/µm$/, () => "Concentrations at which the LINCS lab measured this drug."],
  [/^([\d.]+)\s*h only$/, (m) => `Measured at one time point only (${m[1]} h after adding the drug), a short exposure.`],
  [/^[\d., ]+\s*h$/, () => "Hours after adding the drug at which the LINCS lab measured it."],
  [/^(pool |clinical-stage )?rank \d+/, () => "Position among the scored drugs that have reached clinical trials. Rank 1 pushes gene activity most strongly opposite to Alzheimer's."],
  [/^reversal( score)? -?[\d.]+/, () => "How strongly the drug pushes gene activity opposite to Alzheimer's. Negative means opposite; the more negative, the stronger."],
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
