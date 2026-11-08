import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
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
import { useCurrentProjectId } from "@/api/workspace";
import { Chip } from "@/components/mvp";
import { EmptyState } from "@/components/system";
import { Button } from "@/components/ui/button";
import { FileTextIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { ShellBoundaryContext } from "@/components/BoundaryBanner";
import { AppShell } from "@/app/AppShell";
import { useUrlSync } from "@/app/useUrlSync";
import { CandidatePicker, DrugSearchGroups } from "@/app/CandidatePicker";
import {
  Command,
  CommandDialog,
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
          <EmptyState title={`${exportName.replace("View", "")} unavailable`} />
        </div>
      );
}
const CompareInner = optionalView("compare", "CompareView") as ComponentType<{ drugIds: string[]; projectId?: string }>;
const ReportInner = optionalView("report", "ReportView") as ComponentType<{ drugId: string; projectId?: string }>;
function Compare() {
  const { compareIds } = useUi();
  return <CompareInner drugIds={compareIds} projectId={useCurrentProjectId()} />;
}
function Candidates() {
  return <RepurposingView projectId={useCurrentProjectId()} />;
}
function Evidence() {
  return <EvidenceView projectId={useCurrentProjectId()} />;
}
function Report() {
  const { selectedCandidateId, setStep } = useUi();
  const projectId = useCurrentProjectId();
  if (!selectedCandidateId)
    return (
      <div className="mvp-view">
        <EmptyState
          icon={<FileTextIcon />}
          title="No candidate selected"
          action={
            <div className="flex flex-col items-center gap-2">
              <CandidatePicker variant="button" />
              <Button variant="outline" size="sm" onClick={() => setStep("candidates")}>Browse candidates</Button>
            </div>
          }
        />
      </div>
    );
  return <ReportInner drugId={selectedCandidateId} projectId={projectId} />;
}
const Compounds = optionalView("compounds", "CompoundsView");
const VIEWS: Record<StepId, ComponentType> = {
  projects: ProjectsView,
  screen: ScreenView,
  candidates: Candidates,
  evidence: Evidence,
  compare: Compare,
  compounds: Compounds,
  attack: AttackView,
  report: Report,
  benchmark: BenchmarkView,
  lab: LabView,
  signature: DiseaseSignatureView,
};
import { NAV_ITEMS as ITEMS } from "@/app/nav";
import { applyTheme } from "@/app/theme";
export default function App() {
  useUrlSync();
  const { step, setStep, selectCandidate } = useUi();
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const views = ITEMS.filter(([, label]) => label.toLowerCase().includes(query.trim().toLowerCase()));
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
    applyTheme();
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
        onOpenChange={(open) => {
          setSearch(open);
          if (!open) setQuery("");
        }}
        title="Search workspace"
        description="Pages and drugs"
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Page, drug or brand name" value={query} onValueChange={setQuery} />
          <CommandList>
            {views.length > 0 && (
              <CommandGroup heading="Pages">
                {views.map(([id, label]) => (
                  <CommandItem key={id} value={`view:${id}`} onSelect={() => navigate(id)}>
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <DrugSearchGroups
              query={query}
              quiet={views.length > 0}
              onSelect={(id) => {
                selectCandidate(id);
                setQuery("");
                navigate("evidence");
              }}
            />
          </CommandList>
        </Command>
      </CommandDialog>
    </TooltipProvider>
  );
}
