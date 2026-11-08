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
  SquaresFourIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useCandidates, useHealth, useMockStatus } from "@/api/hooks";
import { useProjects } from "@/api/workspace";
import { StatusBadge, TauMark } from "@/components/system";
import { Kbd } from "@/components/ui/kbd";
import { ThemeToggle } from "@/app/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { useUi, type StepId } from "@/store/ui";
import { NAV_GROUPS } from "./nav";
import { CandidatePicker } from "./CandidatePicker";
import { ViewErrorBoundary } from "./ViewErrorBoundary";

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
  signature: FlowArrowIcon,
};

const navButton =
  "h-10 gap-3 rounded-xl px-3.5 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:[&>span]:hidden text-[14.5px] font-medium text-ink-2 transition-colors hover:bg-primary/8 hover:text-ink [&_svg]:size-5 [&_svg]:text-ink-3 hover:[&_svg]:text-primary data-active:bg-gradient-to-b data-active:from-[#2b6fd3] data-active:to-[#1453ad] data-active:text-white data-active:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)] data-active:[&_svg]:text-white data-active:hover:from-[#3a7ddd] data-active:hover:to-[#185cbc] data-active:hover:text-white data-active:hover:[&_svg]:text-white";

export function AppShell({
  title,
  active,
  onNavigate,
  onExtra,
  onSearch,
  children,
}: {
  title: string;
  /** Current view: a nav step, or an extra page ("cells", "about"). */
  active: StepId | "cells" | "about" | null;
  onNavigate: (id: StepId) => void;
  onExtra: (v: "about" | "cells") => void;
  onSearch: () => void;
  children: ReactNode;
}) {
  const { currentProjectId, setProject, compareIds } = useUi();
  const { data: projects } = useProjects();
  const { data: frozen } = useCandidates();
  const health = useHealth();
  const mock = useMockStatus(frozen?.provenance);
  const project = projects?.find((p) => p.id === currentProjectId) ?? projects?.[0];
  const engine = health.isError ? "offline" : health.isPending ? "connecting" : "online";

  return (
    <SidebarProvider
      // Full sidebar on laptops and up; an icon rail on tablets and small laptops (expandable).
      defaultOpen={typeof window === "undefined" || window.matchMedia("(min-width: 1280px)").matches}
      style={{ "--sidebar-width": "16.5rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
      className="atmosphere h-dvh min-h-0"
    >
      <a className="workspace-skip" href="#workspace">
        Skip to workspace
      </a>
        <Sidebar variant="floating" collapsible="icon" aria-label="Workspace navigation">
          <SidebarHeader className="gap-3 px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2">
            <button
              type="button"
              onClick={() => onNavigate("projects")}
              aria-label="Projects"
              aria-current={active === "projects" ? "page" : undefined}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left"
            >
              <TauMark className="size-7 shrink-0 text-primary" />
              <span className="font-heading text-[17px] font-semibold tracking-tight text-ink [font-stretch:88%] group-data-[collapsible=icon]:hidden">
                Tauchstone
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex w-full items-center gap-2 rounded-xl border border-ink/8 bg-frost/80 px-3 py-2 text-left shadow-[0_1px_2px_rgb(15_24_48/0.04)] hover:bg-frost group-data-[collapsible=icon]:hidden"
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
                <DropdownMenuGroup>
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
                </DropdownMenuGroup>
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
                <SidebarGroupLabel className="h-8 px-3 text-[12px] font-medium text-ink-3">
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
                          tooltip={label}
                          onClick={() => onNavigate(id)}
                        >
                          {Glyph && <Glyph weight={active === id ? "fill" : "regular"} />}
                          <span>{label}</span>
                        </SidebarMenuButton>
                        {id === "compare" && compareIds.length > 0 && (
                          <SidebarMenuBadge className="font-mono text-[11px] text-accent-ink peer-data-active/menu-button:text-white!">
                            {compareIds.length}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
            <SidebarGroup className="py-1.5">
              <SidebarGroupLabel className="h-8 px-3 text-[12px] font-medium text-ink-3">
                Lab
              </SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={active === "signature"}
                    aria-current={active === "signature" ? "page" : undefined}
                    className={navButton}
                    tooltip="Disease signature"
                    onClick={() => onNavigate("signature")}
                  >
                    <FlowArrowIcon weight={active === "signature" ? "fill" : "regular"} />{" "}
                    <span>Disease signature</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={active === "cells"}
                    aria-current={active === "cells" ? "page" : undefined}
                    className={navButton}
                    tooltip="Cell types"
                    onClick={() => onExtra("cells")}
                  >
                    <GridFourIcon weight={active === "cells" ? "fill" : "regular"} />{" "}
                    <span>Cell types</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="px-3 pb-3 group-data-[collapsible=icon]:px-2">
            <SidebarMenuButton
              isActive={active === "about"}
              aria-current={active === "about" ? "page" : undefined}
              className={navButton}
              tooltip="Methods"
              onClick={() => onExtra("about")}
            >
              <InfoIcon weight={active === "about" ? "fill" : "regular"} /> <span>Methods</span>
            </SidebarMenuButton>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0 min-w-0 bg-transparent" aria-label={title}>
          <header className="flex h-[60px] shrink-0 items-center gap-3 px-4 pt-2 md:px-6">
            <SidebarTrigger className="-ml-1 shrink-0 text-ink-3 xl:hidden" aria-label="Toggle sidebar" />
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
              {active !== "projects" && (
                <CandidatePicker
                  className="hidden sm:flex"
                  onPicked={() => {
                    if (!active || !["evidence", "attack", "report"].includes(active)) onNavigate("evidence");
                  }}
                />
              )}
              <button
                type="button"
                onClick={onSearch}
                aria-label="Search workspace"
                className="flex h-8 items-center gap-2 rounded-full border border-rim/90 bg-frost/75 px-3 text-[12px] text-ink-3 shadow-[0_1px_2px_rgb(15_24_48/0.05)] backdrop-blur hover:bg-frost"
              >
                Search <Kbd>⌘K</Kbd>
              </button>
              <ThemeToggle />
            </div>
          </header>
          <div id="workspace" tabIndex={-1} className="min-h-0 flex-1 overflow-auto">
            <ViewErrorBoundary resetKey={`${active}`}>{children}</ViewErrorBoundary>
          </div>
          {engine !== "online" && (
            <footer className="shell-status flex shrink-0 items-center gap-1.5 px-6 pt-1 pb-2.5 font-mono text-[11px] text-ink-3">
              <span className={"size-1.5 rounded-full " + (engine === "offline" ? "bg-bad" : "bg-gap")} />
              Engine {engine}
            </footer>
          )}
        </SidebarInset>
    </SidebarProvider>
  );
}
