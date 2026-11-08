import type { StepId } from "@/store/ui";

/** Workspace views in workflow order. Groups encode the research loop, not decoration. */
export const NAV_GROUPS: { label: string; items: [StepId, string][] }[] = [
  { label: "Discover", items: [["screen", "Screen"], ["candidates", "Candidates"], ["compare", "Compare"]] },
  { label: "Investigate", items: [["evidence", "Drug"], ["attack", "Attack"], ["report", "Report"]] },
  { label: "Library", items: [["compounds", "My compounds"]] },
  { label: "Method", items: [["benchmark", "Validation"]] },
];

export const NAV_ITEMS: [StepId, string][] = [
  ["projects", "Projects"],
  ...NAV_GROUPS.flatMap((g) => g.items),
];
