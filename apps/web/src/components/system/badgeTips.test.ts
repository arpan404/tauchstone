import { expect, it } from "vitest";
import { badgeTip } from "./badgeTips";

it("explains every recurring badge label", () => {
  for (const label of [
    "not preregistered", "preregistered", "held-out", "Weak signature", "QC 7/7", "Report only",
    "Sources disagree", "Cancer lines only", "10 µM only", "6 h only", "predicted low",
    "Brain exposure · predicted low", "approved · phase 4", "ranked", "not in LINCS",
    "name not recognised", "FRAGILE / CONTEXT-DEPENDENT", "SUPPORTED SO FAR", "INSUFFICIENT EVIDENCE",
    "Retrospective benchmark", "co-primary", "Illustration", "No recorded targets",
    "Recommended", "No brain-cell data", "Clinical-stage rank 4", "Reversal score -0.81",
  ])
    expect(badgeTip(label), label).toBeTruthy();
});
it("states what preregistered means and what QC counts", () => {
  expect(badgeTip("not preregistered")).toMatch(/Before any results were seen.*fixed in writing/);
  expect(badgeTip("preregistered")).toMatch(/fixed in writing before any results/);
  expect(badgeTip("QC 7/7")).toMatch(/7 of 7 known Alzheimer's marker genes/);
});
it("states the verdict cut-offs", () => {
  expect(badgeTip("SUPPORTED SO FAR")).toMatch(/0\.8 or more/);
  expect(badgeTip("FRAGILE / CONTEXT-DEPENDENT")).toMatch(/0\.2 or less/);
});
it("returns null for unknown labels", () => {
  expect(badgeTip("zzz")).toBeNull();
  expect(badgeTip("")).toBeNull();
});
