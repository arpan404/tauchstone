import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { useCandidates } from "@/api/hooks";
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
import { Chip } from "@/components/mvp";
import { motion, useReducedMotion } from "motion/react";
import { ShellBoundaryContext } from "@/components/BoundaryBanner";
import { AppShell } from "@/app/AppShell";
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
import { NAV_ITEMS as ITEMS } from "@/app/nav";
export default function App() {
  const { step, setStep, selectCandidate } = useUi();
  const { data } = useCandidates();
  const [search, setSearch] = useState(false);
  const [extra, setExtra] = useState<"about" | "cells" | null>(null);
  const reduce = useReducedMotion();
  const title =
    extra === "about"
      ? "Methods"
      : extra === "cells"
        ? "Cell types"
        : (ITEMS.find(([id]) => id === step)?.[1] ??
          (step === "lab" ? "AI lab" : "Disease signature"));
  const View =
    extra === "about" ? About : extra === "cells" ? SingleCellPanel : VIEWS[step];
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
      <AppShell
        title={title}
        active={extra ? null : step}
        onNavigate={navigate}
        onExtra={setExtra}
        onSearch={() => setSearch(true)}
      >
        <Suspense
          fallback={
            <div className="mvp-view">
              <Chip>Loading</Chip>
            </div>
          }
        >
          <ShellBoundaryContext.Provider value={true}>
            <motion.div
              key={extra ?? step}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="min-h-full"
            >
              <View />
            </motion.div>
          </ShellBoundaryContext.Provider>
        </Suspense>
      </AppShell>
      <CommandDialog
        open={search}
        onOpenChange={setSearch}
        title="Search workspace"
        description="Views and candidates"
      >
        <Command>
          <CommandInput placeholder="Go to a view or candidate" />
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
                  <span className="ml-auto font-mono text-[11px] text-ink-3">#{c.rank}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </TooltipProvider>
  );
}
