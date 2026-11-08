import type { ReactNode } from "react";
import {
  CaretUpDownIcon,
  ColumnsIcon,
  CrosshairIcon,
  FileTextIcon,
  FlaskIcon,
  FlowArrowIcon,
  GridFourIcon,
  InfoIcon,
  ListMagnifyingGlassIcon,
  PillIcon,
  RowsIcon,
  SealCheckIcon,
  SparkleIcon,
  SquaresFourIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useCandidates, useHealth, useMockStatus } from "@/api/hooks";
import { useProjects } from "@/api/workspace";
import { BOUNDARY_TEXT } from "@/components/BoundaryBanner";
import { PlateMark, StatusBadge } from "@/components/system";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { frozenPreregistrationSha256 } from "@/features/about/integrity";
import { useUi, type StepId } from "@/store/ui";
import { NAV_GROUPS } from "./nav";

const ICONS: Partial<Record<StepId, Icon>> = {
  projects: SquaresFourIcon,
  screen: FlaskIcon,
  candidates: RowsIcon,
  compare: ColumnsIcon,
  evidence: PillIcon,
  attack: CrosshairIcon,
  report: FileTextIcon,
  compounds: ListMagnifyingGlassIcon,
  benchmark: SealCheckIcon,
  lab: SparkleIcon,
  signature: FlowArrowIcon,
};

const navButton =
  "h-8 gap-2.5 rounded-md px-2.5 text-[13.5px] text-ink-2 hover:bg-surface-2 hover:text-ink data-active:bg-accent-soft data-active:font-medium data-active:text-accent-ink [&_svg]:size-[17px]";

export function AppShell({
  title,
  active,
  onNavigate,
  onExtra,
  onSearch,
  children,
}: {
  title: string;
  active: StepId | null;
  onNavigate: (id: StepId) => void;
  onExtra: (v: "about" | "cells") => void;
  onSearch: () => void;
  children: ReactNode;
}) {
  const { currentProjectId, setProject, compareIds, selectedCandidateId } = useUi();
  const { data: projects } = useProjects();
  const { data: frozen } = useCandidates();
  const health = useHealth();
  const mock = useMockStatus(frozen?.provenance);
  const project = projects?.find((p) => p.id === currentProjectId) ?? projects?.[0];
  const candidate = frozen?.candidates.find((c) => c.id === selectedCandidateId);
  const expo = import.meta.env.VITE_EXPO === "1";
  const engine = health.isError ? "offline" : health.isPending ? "connecting" : "online";

  return (
    <SidebarProvider
      style={{ "--sidebar-width": "14.5rem" } as React.CSSProperties}
      className="h-dvh min-h-0 bg-canvas"
    >
      <a className="workspace-skip" href="#workspace">
        Skip to workspace
      </a>
        <Sidebar collapsible="offcanvas" className="border-r border-line" aria-label="Workspace navigation">
          <SidebarHeader className="gap-3 px-3 pt-4 pb-2">
            <button
              type="button"
              onClick={() => onNavigate("projects")}
              aria-label="Projects"
              aria-current={active === "projects" ? "page" : undefined}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left"
            >
              <PlateMark />
              <span className="font-heading text-[16px] font-semibold tracking-tight text-ink [font-stretch:88%]">
                Tauchstone
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 text-left hover:border-line-strong"
                aria-label="Switch project"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {project?.name ?? "No project"}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-3">
                    {project?.signature_id ?? "CSV upload"}
                    {project?.n_ranked ? ` · ${project.n_ranked.toLocaleString("en-US")} ranked` : ""}
                  </span>
                </span>
                <CaretUpDownIcon className="size-4 text-ink-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Projects</DropdownMenuLabel>
                {projects?.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => {
                      setProject(p.id);
                      onNavigate(p.n_ranked ? "candidates" : "screen");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {!p.preregistered && <StatusBadge tone="gap">not preregistered</StatusBadge>}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onNavigate("projects")}>
                  <GridFourIcon /> All projects
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarHeader>
          <SidebarContent className="gap-0 px-1">
            {NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.label} className="py-1.5">
                <SidebarGroupLabel className="h-7 px-2.5 text-[11.5px] font-medium text-ink-3">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarMenu className="gap-0.5">
                  {group.items.map(([id, label]) => {
                    const Glyph = ICONS[id];
                    return (
                      <SidebarMenuItem key={id}>
                        <SidebarMenuButton
                          isActive={active === id}
                          aria-current={active === id ? "page" : undefined}
                          className={navButton}
                          onClick={() => onNavigate(id)}
                        >
                          {Glyph && <Glyph weight={active === id ? "fill" : "regular"} />}
                          <span>{label}</span>
                        </SidebarMenuButton>
                        {id === "compare" && compareIds.length > 0 && (
                          <SidebarMenuBadge className="font-mono text-[11px] text-accent-ink">
                            {compareIds.length}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
            {!expo && (
              <SidebarGroup className="py-1.5">
                <SidebarGroupLabel className="h-7 px-2.5 text-[11.5px] font-medium text-ink-3">
                  Lab
                </SidebarGroupLabel>
                <SidebarMenu className="gap-0.5">
                  <SidebarMenuItem>
                    <SidebarMenuButton className={navButton} onClick={() => onNavigate("lab")}>
                      <SparkleIcon /> <span>AI lab</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton className={navButton} onClick={() => onNavigate("signature")}>
                      <FlowArrowIcon /> <span>Disease signature</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton className={navButton} onClick={() => onExtra("cells")}>
                      <GridFourIcon /> <span>Cell types</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>
          <SidebarFooter className="px-3 pb-3">
            <SidebarMenuButton className={navButton} onClick={() => onExtra("about")}>
              <InfoIcon /> <span>Methods</span>
            </SidebarMenuButton>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0 min-w-0 bg-canvas" aria-label={title}>
          <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur md:px-6">
            <SidebarTrigger className="md:hidden" />
            <div className="flex min-w-0 items-baseline gap-2">
              {active !== "projects" && project && (
                <>
                  <button
                    type="button"
                    className="truncate text-[13px] text-ink-3 hover:text-ink"
                    onClick={() => onNavigate("projects")}
                  >
                    {project.name}
                  </button>
                  <span className="text-ink-3">/</span>
                </>
              )}
              <h1 className="m-0 truncate text-[16px] text-ink">{title}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {mock && <StatusBadge tone="gap">Synthetic data</StatusBadge>}
              {selectedCandidateId && active !== "projects" && (
                <button
                  type="button"
                  onClick={() => onNavigate("evidence")}
                  aria-label="Selected candidate"
                  className="hidden items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1.5 text-[13px] hover:border-primary sm:flex"
                >
                  <PillIcon weight="fill" className="size-5 rounded-full bg-accent-soft p-0.5 text-primary" />
                  <span className="max-w-40 truncate font-medium text-ink">
                    {candidate?.name ?? selectedCandidateId}
                  </span>
                  {candidate && typeof candidate.consensus === "number" && (
                    <span className="font-mono text-[12px] text-ink-3">
                      #{candidate.rank} · <span className="text-primary">{candidate.consensus.toFixed(2)}</span>
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onSearch}
                aria-label="Search workspace"
                className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink-3 hover:border-line-strong"
              >
                Search <Kbd>⌘K</Kbd>
              </button>
            </div>
          </header>
          <div id="workspace" tabIndex={-1} className="min-h-0 flex-1 overflow-auto">
            {children}
          </div>
          <footer className="shell-status flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-4 py-1.5 font-mono text-[11px] text-ink-3">
            <span className="flex items-center gap-1.5">
              <span
                className={
                  "size-1.5 rounded-full " +
                  (engine === "online" ? "bg-ok" : engine === "offline" ? "bg-bad" : "bg-gap")
                }
              />
              Engine {engine}
            </span>
            <span>{mock ? "Synthetic data" : "Real data"}</span>
            <span>LINCS gold 113,310</span>
            <span>Prereg {frozenPreregistrationSha256.slice(0, 8)}</span>
            <p role="note" aria-label="Boundary" className="m-0 font-sans text-[11px] text-ink-3 lg:ml-auto">
              {BOUNDARY_TEXT}
            </p>
          </footer>
        </SidebarInset>
    </SidebarProvider>
  );
}
