import { useState } from "react";
import {
  ArrowRightIcon,
  FileCsvIcon,
  FolderPlusIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import {
  useCreateProject,
  useProjects,
  workspaceMock,
  type Project,
} from "@/api/workspace";
import { useUi } from "@/store/ui";
import {
  EmptyState,
  Panel,
  StatusBadge,
  Toolbar,
} from "@/components/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SIGNATURES } from "@/features/screen/signatures";
import { Dot } from "@/features/screen/Dot";

const num = (v: number | null | undefined) =>
  v == null ? null : v.toLocaleString("en-US");

export function ProjectsView() {
  const { data, isPending, error, refetch } = useProjects();
  const { currentProjectId, setProject, setStep } = useUi();
  const [open, setOpen] = useState(false);
  const current = currentProjectId ?? data?.[0]?.id;
  function enter(p: Project) {
    setProject(p.id);
    setStep(p.n_ranked ? "candidates" : "screen");
  }
  return (
    <div className="p-6 max-md:p-3.5">
      <Toolbar>
        <span className="text-[12px] text-ink-3">
          <span className="font-mono text-ink-2 tabular-nums">
            {data?.length ?? 0}
          </span>{" "}
          {data?.length === 1 ? "project" : "projects"}
        </span>
        {workspaceMock() && <StatusBadge tone="gap">Synthetic data</StatusBadge>}
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <PlusIcon weight="bold" />
          New project
        </Button>
      </Toolbar>
      {error ? (
        <EmptyState
          title="Projects unavailable"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      ) : !isPending && !data?.length ? (
        <EmptyState
          icon={<FolderPlusIcon />}
          title="No projects"
          action={<Button onClick={() => setOpen(true)}>New project</Button>}
        />
      ) : (
        <Panel flush className="overflow-hidden">
          <Table aria-label="Projects" className="text-[13.5px]">
            <TableHeader className="bg-surface-2 [&_tr]:border-line">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-4 text-[12px] font-medium text-ink-3">
                  Project
                </TableHead>
                <TableHead className="h-9 text-[12px] font-medium text-ink-3">
                  Signature
                </TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-ink-3">
                  Ranked
                </TableHead>
                <TableHead className="h-9 text-right text-[12px] font-medium text-ink-3">
                  Attack-ready
                </TableHead>
                <TableHead className="h-9 pl-6 text-[12px] font-medium text-ink-3">
                  Preregistration
                </TableHead>
                <TableHead className="h-9 text-[12px] font-medium text-ink-3">
                  Last screen
                </TableHead>
                <TableHead className="h-9 w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? [0, 1].map((i) => (
                    <TableRow key={i} className="border-line">
                      {[220, 90, 50, 40, 110, 80, 16].map((w, j) => (
                        <TableCell key={j} className={j ? "py-4" : "py-4 pl-4"}>
                          <Skeleton className="h-4" style={{ width: w }} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : data?.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      active={p.id === current}
                      onOpen={() => enter(p)}
                    />
                  ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ProjectRow({
  project: p,
  active,
  onOpen,
}: {
  project: Project;
  active: boolean;
  onOpen: () => void;
}) {
  const ranked = num(p.n_ranked);
  return (
    <TableRow
      onClick={onOpen}
      data-active={active || undefined}
      className="group cursor-pointer border-line hover:bg-surface-2 data-active:bg-accent-soft/50"
    >
      <TableCell className="relative py-3 pl-4">
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-2 left-0 w-[3px] rounded-r-sm",
            active ? "bg-primary" : "bg-transparent",
          )}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block rounded-sm text-left font-medium text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {p.name}
        </button>
        {p.description && (
          <span className="mt-0.5 block font-mono text-[11.5px] text-ink-3">
            {p.description}
          </span>
        )}
      </TableCell>
      <TableCell className="py-3">
        {p.signature_id ? (
          <span className="font-mono text-[12.5px] text-ink-2">
            {p.signature_id}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <FileCsvIcon className="size-4 text-ink-3" />
            CSV upload
          </span>
        )}
      </TableCell>
      <TableCell className="py-3 text-right font-mono tabular-nums">
        {ranked ?? <span className="font-sans text-[12.5px] text-ink-3">not screened</span>}
      </TableCell>
      <TableCell className="py-3 text-right font-mono tabular-nums text-ink-2">
        {num(p.n_attack_ready) ?? <span className="text-ink-3">0</span>}
      </TableCell>
      <TableCell className="py-3 pl-6">
        {p.preregistered ? (
          <StatusBadge tone="ok">preregistered</StatusBadge>
        ) : (
          <StatusBadge tone="gap">not preregistered</StatusBadge>
        )}
      </TableCell>
      <TableCell className="py-3">
        {p.last_screen_id ? (
          <span
            className="font-mono text-[12px] text-ink-2"
            title={p.last_screen_id}
          >
            {p.last_screen_id.slice(0, 8)}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-3">none</span>
        )}
      </TableCell>
      <TableCell className="py-3 pr-4 text-right">
        <ArrowRightIcon
          aria-hidden
          className="ml-auto size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-data-active:opacity-100"
        />
      </TableCell>
    </TableRow>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateProject();
  const { setProject, setStep } = useUi();
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string>("GSE132903");
  const options = [
    ...SIGNATURES.map((s) => ({ id: s.id as string, label: s.id, meta: s.name })),
    { id: "", label: "Upload CSV", meta: "gene · log2fc · stat · fdr" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-5 shadow-overlay sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-[15px] font-semibold">
            New project
          </DialogTitle>
        </DialogHeader>
        <form
          id="new-project"
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { name: name.trim(), signature_id: signature || null },
              {
                onSuccess: (p) => {
                  setProject(p.id);
                  setStep("screen");
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          <label className="grid gap-1.5">
            <span className="text-[12px] text-ink-3">Name</span>
            <Input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-9 rounded-md border-line-strong bg-surface text-[13.5px] focus-visible:outline-none"
            />
          </label>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-[12px] text-ink-3">Signature</legend>
            <div className="overflow-hidden rounded-md border border-line-strong">
              {options.map((o) => {
                const on = signature === o.id;
                return (
                  <button
                    key={o.id || "upload"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSignature(o.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 outline-none focus-visible:bg-surface-2",
                      on ? "bg-accent-soft/60" : "hover:bg-surface-2",
                    )}
                  >
                    <Dot on={on} />
                    <span className={cn("text-[13px]", o.id && "font-mono", on ? "text-ink" : "text-ink-2")}>
                      {o.label}
                    </span>
                    <span className="ml-auto text-[12px] text-ink-3">{o.meta}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </form>
        <DialogFooter className="-mx-5 -mb-5 items-center border-line bg-surface-2 px-5 py-3 sm:justify-between">
          <span className="flex items-center gap-2">
            <StatusBadge tone="gap">not preregistered</StatusBadge>
            {create.error && <StatusBadge tone="bad">Project unavailable</StatusBadge>}
          </span>
          <Button
            type="submit"
            form="new-project"
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
