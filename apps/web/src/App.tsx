import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { useCandidates, useHealth, useMockStatus } from "@/api/hooks";
import { useProjects } from "@/api/workspace";
import { About } from "@/features/about";
import { LabView } from "@/features/lab";
import { BenchmarkView } from "@/features/benchmark/BenchmarkView";
import { DiseaseSignatureView } from "@/features/disease-signature/DiseaseSignatureView";
import { EvidenceView } from "@/features/evidence/EvidenceView";
import { RepurposingView } from "@/features/repurposing/RepurposingView";
import { SingleCellPanel } from "@/features/single-cell";
import { AttackView } from "@/features/tauchstone/AttackView";
import { ProjectsView } from "@/features/projects/ProjectsView";
import { ScreenView } from "@/features/screen/ScreenView";
import { Action, Chip } from "@/components/mvp";
import { BOUNDARY_TEXT, ShellBoundaryContext } from "@/components/BoundaryBanner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUi, type StepId } from "@/store/ui";
const modules = import.meta.glob(
  "./features/{compare,report,compounds}/**/*.tsx",
);
function optionalView(folder: string, exportName: string) {
  const path =
    Object.keys(modules).find((p) =>
      p.endsWith(`/${folder}/${exportName}.tsx`),
    ) ?? Object.keys(modules).find((p) => p.endsWith(`/${folder}/index.tsx`));
  return path
    ? lazy(async () => {
        const mod = (await modules[path]()) as Record<string, ComponentType>;
        return { default: mod[exportName] ?? mod.default };
      })
    : () => (
        <div className="mvp-view">
          <Chip>{exportName.replace("View", "")} · pending</Chip>
        </div>
      );
}
const CompareInner = optionalView("compare", "CompareView") as ComponentType<{ drugIds: string[]; projectId?: string }>;
const ReportInner = optionalView("report", "ReportView") as ComponentType<{ drugId: string; projectId?: string }>;
function Compare() {
  const { compareIds, currentProjectId } = useUi();
  if (compareIds.length < 2) return <div className="mvp-view"><Chip>Select 2–4 candidates</Chip></div>;
  return <CompareInner drugIds={compareIds} projectId={currentProjectId ?? undefined} />;
}
function Report() {
  const { selectedCandidateId, currentProjectId } = useUi();
  if (!selectedCandidateId) return <div className="mvp-view"><Chip>Select a candidate</Chip></div>;
  return <ReportInner drugId={selectedCandidateId} projectId={currentProjectId ?? undefined} />;
}
const Compounds = optionalView("compounds", "CompoundsView");
const VIEWS: Record<StepId, ComponentType> = {
  projects: ProjectsView,
  screen: ScreenView,
  candidates: RepurposingView,
  evidence: EvidenceView,
  compare: Compare,
  compounds: Compounds,
  attack: AttackView,
  report: Report,
  benchmark: BenchmarkView,
  lab: LabView,
  signature: DiseaseSignatureView,
};
const ITEMS: [StepId, string][] = [
  ["projects", "Projects"],
  ["screen", "Screen"],
  ["candidates", "Candidates"],
  ["evidence", "Drug"],
  ["compare", "Compare"],
  ["compounds", "My compounds"],
  ["attack", "Attack"],
  ["report", "Report"],
  ["benchmark", "Validation"],
];
export default function App() {
  const {
    step,
    setStep,
    selectedCandidateId,
    selectCandidate,
    currentProjectId,
    compareIds,
  } = useUi();
  const { data } = useCandidates();
  const { data: projects } = useProjects();
  const health = useHealth();
  const mock = useMockStatus(data?.provenance);
  const [search, setSearch] = useState(false);
  const [extra, setExtra] = useState<"about" | "cells" | null>(null);
  const project =
    projects?.find((p) => p.id === currentProjectId) ?? projects?.[0];
  const candidate = data?.candidates.find((c) => c.id === selectedCandidateId);
  const expo = import.meta.env.VITE_EXPO === "1";
  const title =
    extra === "about"
      ? "Methods"
      : extra === "cells"
        ? "Cell types"
        : (ITEMS.find(([id]) => id === step)?.[1] ??
          (step === "lab" ? "AI lab" : "Disease signature"));
  const View =
    extra === "about"
      ? About
      : extra === "cells"
        ? SingleCellPanel
        : VIEWS[step];
  function navigate(id: StepId) {
    setExtra(null);
    setStep(id);
    setSearch(false);
  }
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <TooltipProvider>
      <a className="workspace-skip" href="#workspace">
        Skip to workspace
      </a>
      <div className="shell">
        <aside className="shell-side" aria-label="Workspace navigation">
          <div className="shell-logo">
            <i />
            Tauchstone
          </div>
          {ITEMS.map(([id, label], i) => (
            <div key={id} className="contents">
              {i === 1 && (
                <div className="shell-group">{project?.name ?? "Project"}</div>
              )}
              <button
                className="shell-nav"
                aria-current={step === id && !extra ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                {label}
                {id === "compare" && <b>{compareIds.length}</b>}
              </button>
            </div>
          ))}
          {!expo && (
            <>
              <div className="shell-group">Lab</div>
              <button className="shell-nav" onClick={() => navigate("lab")}>
                AI lab
              </button>
              <button
                className="shell-nav"
                onClick={() => navigate("signature")}
              >
                Disease signature
              </button>
              <button className="shell-nav" onClick={() => setExtra("cells")}>
                Cell types
              </button>
              <button className="shell-nav" onClick={() => setExtra("about")}>
                Methods
              </button>
            </>
          )}
          <div className="shell-live">
            <i
              style={{
                background: health.isError
                  ? "var(--bad)"
                  : health.isPending
                    ? "var(--warm)"
                    : "var(--ok)",
              }}
            />
            {health.isError
              ? "Engine offline"
              : health.isPending
                ? "Connecting"
                : "Engine online"}
          </div>
        </aside>
        <div className="shell-main">
          <header className="shell-bar">
            <div>
              {step !== "projects" && (
                <div className="shell-crumb">
                  {["evidence", "attack", "report"].includes(step)
                    ? (candidate?.name ?? project?.name)
                    : project?.name}
                </div>
              )}
              <h1>{title}</h1>
            </div>
            <div className="shell-actions">
              {mock && <Chip tone="gap">Synthetic data</Chip>}
              <button
                className="shell-crumb"
                onClick={() => setSearch(true)}
                aria-label="Search workspace"
              >
                ⌘ K
              </button>
              {step === "projects" && (
                <Action onClick={() => navigate("screen")}>New screen</Action>
              )}
            </div>
          </header>
          <main
            id="workspace"
            tabIndex={-1}
            className="shell-content"
            aria-label={title}
          >
            <Suspense
              fallback={
                <div className="mvp-view">
                  <Chip>Loading</Chip>
                </div>
              }
            >
              <ShellBoundaryContext.Provider value={true}>
                <View />
              </ShellBoundaryContext.Provider>
            </Suspense>
          </main>
          <footer className="shell-footer">{BOUNDARY_TEXT}</footer>
        </div>
      </div>
      <CommandDialog
        open={search}
        onOpenChange={setSearch}
        title="Search workspace"
        description="Views · candidates"
      >
        <Command>
          <CommandInput placeholder="Views · candidates" />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup heading="Workspace">
              {ITEMS.map(([id, label]) => (
                <CommandItem key={id} onSelect={() => navigate(id)}>
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Candidates">
              {data?.candidates.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.id}`}
                  onSelect={() => {
                    selectCandidate(c.id);
                    navigate("evidence");
                  }}
                >
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </TooltipProvider>
  );
}
