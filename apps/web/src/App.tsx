import { useEffect, useState, type CSSProperties } from 'react';
import { BookOpen, ChartNoAxesCombined, Dna, FlaskConical, Layers3, Microscope, Moon, Search, ShieldCheck, Sun, Table2 } from 'lucide-react';
import { useCandidates, useMockStatus } from '@/api/hooks';
import { About } from '@/features/about';
import { BenchmarkView } from '@/features/benchmark/BenchmarkView';
import { DiseaseSignatureView } from '@/features/disease-signature/DiseaseSignatureView';
import { EvidenceView } from '@/features/evidence/EvidenceView';
import { RepurposingView } from '@/features/repurposing/RepurposingView';
import { SingleCellPanel } from '@/features/single-cell';
import { AttackView } from '@/features/tauchstone/AttackView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUi, type StepId } from '@/store/ui';

const VIEWS: Record<StepId, () => React.JSX.Element> = {
  candidates: RepurposingView,
  signature: DiseaseSignatureView,
  evidence: EvidenceView,
  attack: AttackView,
  benchmark: BenchmarkView,
};
const ITEMS = [
  { id: 'candidates', label: 'Candidates', icon: Table2, group: 'Research' },
  { id: 'signature', label: 'Disease signature', icon: Dna, group: 'Research' },
  { id: 'evidence', label: 'Evidence', icon: Layers3, group: 'Research' },
  { id: 'attack', label: 'Experiments', icon: FlaskConical, group: 'Validation' },
  { id: 'benchmark', label: 'Benchmark', icon: ChartNoAxesCombined, group: 'Validation' },
  { id: 'cells', label: 'Cell types', icon: Microscope, group: 'Analysis' },
  { id: 'about', label: 'Methods', icon: BookOpen, group: 'Analysis' },
] as const;
type PageId = typeof ITEMS[number]['id'];
type ExtraId = 'cells' | 'about';

function WorkspaceSidebar({ page, navigate, candidateId, candidateName }: { page: PageId; navigate: (id: PageId) => void; candidateId: string | null; candidateName?: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  function open(id: PageId) {
    navigate(id);
    if (isMobile) setOpenMobile(false);
  }
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-20 justify-center px-4 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><FlaskConical className="size-[19px]" strokeWidth={1.7} aria-hidden="true" /></span>
          <div className="group-data-[collapsible=icon]:hidden"><p className="font-heading text-[17px] font-bold tracking-tight text-foreground">Tauchstone</p><p className="mt-0.5 text-[11px] text-muted-foreground">Second Life research</p></div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1">
        <nav aria-label="Research workspace">
          {['Research', 'Validation', 'Analysis'].map(group => (
            <SidebarGroup key={group} className="px-3 py-2">
              <SidebarGroupLabel className="mb-1 px-2 text-[10px] font-medium tracking-wider text-muted-foreground">{group}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu className="gap-1">
                {ITEMS.filter(item => item.group === group).map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton onClick={() => open(id)} isActive={page === id} aria-current={page === id ? 'page' : undefined} tooltip={label} className="h-9 gap-2.5 rounded-lg px-2.5 text-[13px] data-active:font-medium">
                      <Icon strokeWidth={1.6} aria-hidden="true" /><span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-3 p-4 group-data-[collapsible=icon]:px-2">
        <section aria-label="Selected candidate" className="rounded-lg border border-sidebar-border bg-card p-3 group-data-[collapsible=icon]:hidden">
          <p className="text-[11px] text-muted-foreground">Current investigation</p>
          <p className="mt-1.5 break-words text-sm font-medium text-foreground">{candidateName ?? candidateId ?? 'No candidate selected'}</p>
          {candidateId ? <div className="mt-3 flex flex-col items-start gap-1">
            <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => open('evidence')}>View evidence</Button>
            <Button size="sm" variant="secondary" className="w-full justify-start" onClick={() => open('attack')}>Open experiments</Button>
          </div> : <Button size="sm" variant="outline" className="mt-3" onClick={() => open('candidates')}>Choose a candidate</Button>}
        </section>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /><span className="group-data-[collapsible=icon]:hidden">Research hypotheses only</span></div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function App() {
  const { step, setStep, selectedCandidateId, selectCandidate } = useUi();
  const { data } = useCandidates();
  const mock = useMockStatus(data?.provenance);
  const [extraAt, setExtraAt] = useState<{ page: ExtraId; step: StepId } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('tauchstone-theme') === 'dark');
  const extra = extraAt?.step === step ? extraAt.page : null;
  const page = extra ?? step;
  const title = ITEMS.find(item => item.id === page)!.label;
  const View = extra === 'cells' ? SingleCellPanel : extra === 'about' ? About : VIEWS[step];
  const candidate = data?.candidates.find(c => c.id === selectedCandidateId);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('tauchstone-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function navigate(id: PageId) {
    if (id === 'cells' || id === 'about') setExtraAt({ page: id, step });
    else { setExtraAt(null); setStep(id); }
    setSearchOpen(false);
  }

  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden" style={{ '--sidebar-width': '14rem' } as CSSProperties}>
        <a className="workspace-skip" href="#workspace">Skip to workspace</a>
        <WorkspaceSidebar page={page} navigate={navigate} candidateId={selectedCandidateId} candidateName={candidate?.name} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
            <SidebarTrigger className="text-muted-foreground" />
            <Separator orientation="vertical" className="mr-1 h-4" />
            <Breadcrumb><BreadcrumbList className="text-xs"><BreadcrumbItem className="hidden sm:block">Second Life</BreadcrumbItem><BreadcrumbSeparator className="hidden sm:block" /><BreadcrumbItem><BreadcrumbPage className="font-medium">{title}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              {mock && <Badge variant="outline" className="text-[10px] text-[var(--warning)]" role="status" aria-label="Mock data mode">Synthetic data</Badge>}
              <Button variant="outline" onClick={() => setSearchOpen(true)} aria-label="Search workspace" className="h-8 gap-2 text-xs text-muted-foreground"><Search className="size-3.5" /><span className="hidden sm:inline">Search workspace</span><kbd className="ml-3 hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">⌘ K</kbd></Button>
              <Button variant="ghost" size="icon" onClick={() => setDark(value => !value)} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
            </div>
          </header>
          <main id="workspace" tabIndex={-1} className="workspace-main min-h-0 flex-1 overflow-auto outline-none" aria-label={title}><View /></main>
        </div>
        <CommandDialog open={searchOpen} onOpenChange={setSearchOpen} title="Search workspace" description="Open a research view or inspect a discovery candidate.">
          <Command><CommandInput placeholder="Search views or candidates…" /><CommandList><CommandEmpty>No matching views or loaded candidates.</CommandEmpty><CommandGroup heading="Workspace">{ITEMS.map(({ id, label, icon: Icon }) => <CommandItem key={id} value={label} onSelect={() => navigate(id)}><Icon className="size-4 text-muted-foreground" /><span>{label}</span></CommandItem>)}</CommandGroup><CommandSeparator /><CommandGroup heading="Discovery candidates">{data?.candidates.map(c => <CommandItem key={c.id} value={`${c.name} ${c.id}`} onSelect={() => { selectCandidate(c.id); navigate('evidence'); }}><span className="flex-1">{c.name}</span><span className="font-mono text-[11px] text-muted-foreground">#{c.rank}</span></CommandItem>)}</CommandGroup></CommandList></Command>
        </CommandDialog>
      </SidebarProvider>
    </TooltipProvider>
  );
}
