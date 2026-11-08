import { useEffect } from "react";
import { useUi, type StepId } from "@/store/ui";

/**
 * Keeps the address bar in step with the workspace so Back, reload and shared links work.
 * Hash routes need no server rewrite (works under nginx and the Vite dev server):
 *   #/candidates?project=GSE132903
 *   #/drug/BRD-K86873305?project=GSE132903
 */
const SLUGS: Record<StepId, string> = {
  projects: "projects",
  screen: "screen",
  candidates: "candidates",
  compare: "compare",
  evidence: "drug",
  attack: "attack",
  report: "report",
  compounds: "compounds",
  benchmark: "validation",
  lab: "lab",
  signature: "signature",
};
const STEPS = Object.fromEntries(Object.entries(SLUGS).map(([k, v]) => [v, k])) as Record<string, StepId>;
const WITH_DRUG = new Set<StepId>(["evidence", "attack", "report"]);

export interface Route {
  step: StepId;
  drug: string | null;
  project: string | null;
}

export function formatRoute({ step, drug, project }: Route): string {
  const path = WITH_DRUG.has(step) && drug ? `${SLUGS[step]}/${encodeURIComponent(drug)}` : SLUGS[step];
  return `#/${path}${project ? `?project=${encodeURIComponent(project)}` : ""}`;
}

export function parseRoute(hash: string): Route | null {
  const m = /^#\/([a-z-]+)(?:\/([^?]+))?(?:\?(.*))?$/.exec(hash);
  if (!m || !STEPS[m[1]]) return null;
  const project = new URLSearchParams(m[3] ?? "").get("project");
  return { step: STEPS[m[1]], drug: m[2] ? decodeURIComponent(m[2]) : null, project };
}

function current(): Route {
  const s = useUi.getState();
  return { step: s.step, drug: s.selectedCandidateId, project: s.currentProjectId };
}

function apply(route: Route) {
  const s = useUi.getState();
  if (route.project && route.project !== s.currentProjectId) s.setProject(route.project);
  if (route.drug && route.drug !== useUi.getState().selectedCandidateId) useUi.getState().selectCandidate(route.drug);
  if (route.step !== useUi.getState().step) useUi.getState().setStep(route.step);
}

export function useUrlSync() {
  useEffect(() => {
    // Address bar wins on load (shared link or reload).
    const initial = parseRoute(window.location.hash);
    if (initial) apply(initial);
    else window.history.replaceState(null, "", formatRoute(current()));

    let last = formatRoute(current());
    const unsubscribe = useUi.subscribe((state, prev) => {
      const next = formatRoute({ step: state.step, drug: state.selectedCandidateId, project: state.currentProjectId });
      if (next === last) return;
      // A new page is a history entry; changing the drug or project on the same page replaces it.
      if (state.step !== prev.step) window.history.pushState(null, "", next);
      else window.history.replaceState(null, "", next);
      last = next;
    });
    const onPop = () => {
      const route = parseRoute(window.location.hash);
      if (!route) return;
      last = formatRoute(route);
      apply(route);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPop);
    };
  }, []);
}
