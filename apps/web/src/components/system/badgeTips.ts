/**
 * Plain-language meaning of every badge label in the app, shown as a hover tooltip.
 * Sources: data/manifests/preregistration.yaml, processed/signatures/*__qc.md (sign check),
 * docs/integrity_log.md, ChEMBL / Open Targets fields. Wording follows AGENTS.md (no clinical claims).
 */
const EXACT: Record<string, string> = {
  "not preregistered":
    "Exploratory. Only the GSE132903 ranking and its hidden tests were fixed in writing before any results were seen (preregistration 21f7460e). This is outside that locked analysis.",
  preregistered:
    "Part of the analysis fixed in writing before any results were seen (preregistration 21f7460e), so it cannot have been tuned to the outcome.",
  "held-out":
    "Held-out cohort: kept back to test candidates in Attack. Never used to build the ranking, set thresholds or choose candidates.",
  "weak signature":
    "No gene reaches FDR < 0.05 in this cohort after normalisation, and only 5 of 7 marker genes move the expected way. Screens from it are low-signal.",
  "report only":
    "Shown for comparison only. Outside resources never change the ranking, the hidden tests or the verdict.",
  "sources disagree":
    "This drug ranks very differently in the outside resources than in our LINCS ranking. They use different drug libraries and assays.",
  illustration: "Animated illustration of the screen state, not a simulation of the data.",
  "co-primary": "One of the two primary policies fixed in the preregistration; both are reported, whatever the result.",
  descriptive: "Reported for context only; not part of the preregistered statistical tests.",
  "retrospective benchmark":
    "Replayed on 50 drugs whose hidden outcomes were sealed in advance. It measures the test-picking strategy, not the drugs.",
  "frozen run": "The original preregistered GSE132903 screen. Re-running a screen never replaces it.",
  ranked: "In the LINCS ranking for this project, with a pool rank and reversal score.",
  "not rankable": "In LINCS, but measured in too few contexts (under 3) to be ranked.",
  "not in lincs": "A known compound, but LINCS L1000 has no signatures for it.",
  "name not recognised": "No compound with this name or brand name was found.",
  "cancer lines only": "Every LINCS measurement for this drug comes from cancer cell lines, none from neural cells.",
  "no recorded targets": "No known molecular target in ChEMBL or Open Targets.",
  "neural-line ranking data": "At least one ranking measurement comes from a neural cell line (for example NEU or NPC).",
  "no neural-line ranking data": "No ranking measurement comes from a neural cell line; all are from other cell types.",
  "brain-cell data": "Has LINCS measurements in neural cells, not only in cancer lines.",
  neural: "Has LINCS measurements in neural cells, not only in cancer lines.",
  survived: "This revealed test passed its preregistered rule; belief in the claim goes up.",
  failed: "This revealed test did not pass its preregistered rule; belief in the claim goes down.",
  "supported so far": "The claim has held up on the tests revealed so far. More tests could still break it.",
  "fragile / context-dependent": "The claim broke on at least one held-out test: it depends on the context it was measured in.",
  "insufficient evidence": "Not enough tests revealed yet to call the claim either way.",
  ready: "Ready to screen.",
  scoring: "Scoring LINCS signatures against the disease signature now.",
  done: "Screen finished; the ranking is ready in Candidates.",
  provisional: "Partial ranking while the screen runs; final ranks appear when it finishes.",
  "synthetic data": "Showing built-in example data, not real results.",
  approved: "Approved for at least one indication (ChEMBL). Approval says nothing about Alzheimer's.",
  investigational: "Has reached clinical trials but is not approved for any indication.",
  "target context": "A protein structure of the drug's target, shown for orientation. It is not evidence that the drug binds.",
};

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^qc (\d+)\/(\d+)$/, (m) =>
    `Sign check: ${m[1]} of ${m[2]} known Alzheimer's marker genes move the expected way (GFAP, CD44, SERPINA3 up; SST, VGF, NPTX2, BDNF down).`],
  [/^approved\s*·?\s*phase (\d+)/, (m) =>
    `Highest clinical stage in ChEMBL: phase ${m[1]}${m[1] === "4" ? " (approved for at least one indication)" : ""}.`],
  [/^phase (\d+)/, (m) => `Highest clinical stage reached in ChEMBL: phase ${m[1]}.`],
  [/^brain exposure\s*[·:]?\s*(measured|curated|predicted)\s*(.*)$/, (m) =>
    `Brain exposure is ${m[1]} ${m[2] ? `as "${m[2]}"` : ""}: measured = experimental data, curated = from literature databases, predicted = model estimate.`],
  [/^(measured|curated|predicted) (low|penetrant|high).*$/, (m) =>
    `Brain exposure, ${m[1]}: ${m[2] === "low" ? "unlikely to reach the brain" : "expected to reach the brain"}. measured = experimental data, curated = from literature databases, predicted = model estimate.`],
  [/^no predicted data$/, () => "No measured, curated or predicted brain-exposure value is available."],
  [/^brain-cell data\s*·?\s*(\S+)/, (m) => `Reversal score in the neural cell line ${m[1]}, not only in cancer lines.`],
  [/^([\d.]+)\s*µm only$/, (m) => `Measured at a single concentration only (${m[1]} µM); no dose range.`],
  [/µm$/, () => "Concentrations at which LINCS measured this drug."],
  [/^([\d.]+)\s*h only$/, (m) => `Measured at a single time point only (${m[1]} h), an acute exposure.`],
  [/^[\d., ]+\s*h$/, () => "Time points at which LINCS measured this drug."],
  [/^pool rank \d+/, () => "Position in the ranked pool of clinical-stage drugs; 1 reverses the Alzheimer's signature most strongly."],
  [/^reversal -?[\d.]+/, () => "Consensus reversal score: negative means the drug pushes gene expression opposite to Alzheimer's."],
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
