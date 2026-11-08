import { expect, it } from "vitest";
import { badgeTip } from "./badgeTips";

it("explains every recurring badge label", () => {
  for (const label of [
    "not preregistered", "preregistered", "held-out", "Weak signature", "QC 7/7", "Report only",
    "Sources disagree", "Cancer lines only", "10 µM only", "6 h only", "predicted low",
    "Brain exposure · predicted low", "approved · phase 4", "ranked", "not in LINCS",
    "name not recognised", "FRAGILE / CONTEXT-DEPENDENT", "SUPPORTED SO FAR", "INSUFFICIENT EVIDENCE",
    "Retrospective benchmark", "co-primary", "Illustration", "No recorded targets",
  ])
    expect(badgeTip(label), label).toBeTruthy();
});
it("states what preregistered means and what QC counts", () => {
  expect(badgeTip("not preregistered")).toMatch(/fixed in writing before any results/);
  expect(badgeTip("QC 7/7")).toMatch(/7 of 7 known Alzheimer's marker genes/);
});
it("returns null for unknown labels", () => {
  expect(badgeTip("zzz")).toBeNull();
  expect(badgeTip("")).toBeNull();
});
