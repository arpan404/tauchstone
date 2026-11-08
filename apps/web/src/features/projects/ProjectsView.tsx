import { useState, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  FlaskIcon,
  FolderPlusIcon,
  FoldersIcon,
  PlusIcon,
  SealCheckIcon,
  SnowflakeIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  workspaceMock,
  type Project,
} from "@/api/workspace";
import { useUi } from "@/store/ui";
import { EmptyState, NumberTicker, StatusBadge, Term } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FROZEN_SIGNATURE, SIGNATURES } from "@/features/screen/signatures";

const num = (v: number | null | undefined) =>
  v == null ? null : v.toLocaleString("en-US");

/** Desktop column template shared by the header and every row. */
const COLS =
  "md:grid-cols-[minmax(0,2.1fr)_minmax(0,0.9fr)_76px_96px_minmax(0,1.15fr)_minmax(0,0.75fr)_56px]";
/** Selected / hover states from the Nov 8 brief: no shadows, a ring and a tint. */
const SELECTED =
  "bg-gradient-to-b from-[#2b6fd3] to-[#1453ad] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)]";
const FIELD =
  "h-10 rounded-xl border-0 bg-frost/70 px-3 text-[13.5px] ring-1 ring-ink/12 backdrop-blur focus-visible:ring-2 focus-visible:ring-primary";
const GLASS_EMPTY = "";

function PreregBadge({ on }: { on: boolean }) {
  return on ? (
    <StatusBadge tone="ok">
      <SealCheckIcon weight="fill" aria-hidden />
      preregistered
    </StatusBadge>
  ) : (
    <StatusBadge tone="gap">
      <WarningCircleIcon aria-hidden />
      not preregistered
    </StatusBadge>
  );
}

export function ProjectsView() {
  const { data, isPending, error, refetch } = useProjects();
  const { currentProjectId, setProject, setStep } = useUi();
  const [open, setOpen] = useState(false);
  const [doomed, setDoomed] = useState<Project | null>(null);
  const current = currentProjectId ?? data?.[0]?.id;
  const screened = data?.filter((p) => p.n_ranked).length ?? 0;
  const prereg = data?.filter((p) => p.preregistered).length ?? 0;
  function enter(p: Project) {
    setProject(p.id);
    setStep(p.n_ranked ? "candidates" : "screen");
  }
  return (
    <div className="grid gap-4 p-6 max-md:gap-3 max-md:p-3.5">
      <section
        aria-labelledby="projects-title"
        className="glass relative overflow-hidden px-7 pt-6 pb-6 max-md:px-5 max-md:pt-5"
      >
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <p className="m-0 flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
              <FoldersIcon className="size-4 text-primary" aria-hidden />
              Projects
            </p>
            <h1
              id="projects-title"
              className="m-0 mt-2 font-heading text-[44px] leading-[1.04] font-normal tracking-[-0.035em] text-ink max-md:text-[34px]"
            >
              Alzheimer&rsquo;s projects
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge>
                <FlaskIcon aria-hidden />
                LINCS L1000 quality-filtered
              </StatusBadge>
              <StatusBadge>One signature per cohort</StatusBadge>
              {workspaceMock() && (
                <StatusBadge tone="gap">Synthetic data</StatusBadge>
              )}
            </div>
            <dl className="m-0 mt-7 flex flex-wrap items-end gap-x-9 gap-y-4">
              <div>
                <dt className="text-[11.5px] text-ink-3">Projects</dt>
                <dd className="m-0 mt-1 font-mono text-[52px] leading-[0.95] font-normal tracking-[-0.04em] text-primary tabular-nums max-md:text-[44px]">
                  <NumberTicker value={data?.length ?? 0} />
                </dd>
              </div>
              <Metric label="Screened" value={screened} />
              <Metric label="Preregistered" value={prereg} />
            </dl>
          </div>
          <div className="flex items-center gap-2 max-md:[&>button]:flex-1">
            <Button onClick={() => setOpen(true)} className="h-10 px-5">
              <PlusIcon weight="bold" />
              New project
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <EmptyState
          className={GLASS_EMPTY}
          icon={<WarningCircleIcon />}
          title="Projects unavailable"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              <ArrowClockwiseIcon />
              Retry
            </Button>
          }
        />
      ) : !isPending && !data?.length ? (
        <EmptyState
          className={GLASS_EMPTY}
          icon={<FolderPlusIcon />}
          title="No projects"
          action={
            <Button onClick={() => setOpen(true)}>
              <PlusIcon weight="bold" />
              New project
            </Button>
          }
        />
      ) : (
        <section className="glass min-w-0 p-2 max-md:p-1.5">
          <div role="table" aria-label="Projects" className="text-[13.5px]">
            <div role="rowgroup" className="max-md:sr-only">
              <div
                role="row"
                className={cn(
                  "grid items-center gap-x-4 px-4 pt-2.5 pb-1.5 text-[11.5px] text-ink-3",
                  COLS,
                )}
              >
                <span role="columnheader">Project</span>
                <span role="columnheader">Signature</span>
                <span role="columnheader" className="text-right">
                  Ranked
                </span>
                <span role="columnheader" className="text-right">
                  <Term tip="Drugs with hidden checks set up, so they can be tested on the Attack page.">Testable</Term>
                </span>
                <span role="columnheader" className="pl-3">
                  Preregistration
                </span>
                <span role="columnheader">Last screen</span>
                <span role="columnheader">
                  <span className="sr-only">Actions</span>
                </span>
              </div>
            </div>
            <div role="rowgroup" className="grid gap-1">
              {isPending
                ? [0, 1].map((i) => (
                    <div
                      key={i}
                      role="row"
                      className={cn(
                        "grid h-14 items-center gap-x-4 rounded-xl px-4",
                        COLS,
                      )}
                    >
                      {[220, 90, 50, 40, 110, 80].map((w, j) => (
                        <span
                          key={j}
                          role="cell"
                          className={cn(j > 0 && "max-md:hidden")}
                        >
                          <Skeleton
                            className="h-4 rounded-full bg-ink/[0.06]"
                            style={{ width: w }}
                          />
                        </span>
                      ))}
                    </div>
                  ))
                : data?.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      active={p.id === current}
                      onOpen={() => enter(p)}
                      onDelete={() => setDoomed(p)}
                    />
                  ))}
            </div>
          </div>
        </section>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
      <DeleteProjectDialog
        project={doomed}
        onClose={() => setDoomed(null)}
        onDeleted={(id) => {
          if (id === currentProjectId) setProject(data?.[0]?.id ?? null);
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="m-0 mt-1 font-mono text-[22px] leading-none font-normal text-ink tabular-nums">
        <NumberTicker value={value} />
      </dd>
    </div>
  );
}

/** On phones each row stacks; the small label names the value the header would. */
function Cell({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span role="cell" className={cn("min-w-0", className)}>
      {label && (
        <span className="mr-1.5 text-[11px] text-ink-3 md:hidden">{label}</span>
      )}
      {children}
    </span>
  );
}

function ProjectRow({
  project: p,
  active,
  onOpen,
  onDelete,
}: {
  project: Project;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const ranked = num(p.n_ranked);
  return (
    <div
      role="row"
      onClick={onOpen}
      data-active={active || undefined}
      className={cn(
        "group relative grid cursor-pointer items-center gap-x-4 rounded-xl px-4 py-3 transition-colors",
        "max-md:grid-cols-2 max-md:gap-y-2 max-md:pr-12",
        COLS,
        active
          ? "bg-primary/10 ring-1 ring-primary/25"
          : "hover:bg-primary/6",
      )}
    >
      <Cell className="max-md:col-span-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block max-w-full rounded-md text-left text-[14px] font-medium break-words text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {p.name}
        </button>
        {p.description && (
          <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-3">
            {p.description}
          </span>
        )}
      </Cell>
      <Cell>
        {p.signature_id ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink-2">
            <FlaskIcon className="size-4 text-primary" aria-hidden />
            {p.signature_id}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <UploadSimpleIcon className="size-4 text-primary" aria-hidden />
            CSV upload
          </span>
        )}
      </Cell>
      <Cell label="Ranked" className="font-mono tabular-nums md:text-right">
        {ranked ?? (
          <span className="font-sans text-[12.5px] text-ink-3">not screened</span>
        )}
      </Cell>
      <Cell
        label="Testable"
        className="font-mono text-ink-2 tabular-nums md:text-right"
      >
        {num(p.n_attack_ready) ?? <span className="text-ink-3">0</span>}
      </Cell>
      <Cell className="md:pl-3">
        <PreregBadge on={!!p.preregistered} />
      </Cell>
      <Cell label="Last screen">
        {p.last_screen_id?.startsWith("frozen-") ? (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-2"
            title={p.last_screen_id}
          >
            <SnowflakeIcon className="size-3.5 text-primary" aria-hidden />
            original run
          </span>
        ) : p.last_screen_id ? (
          <span
            className="font-mono text-[12px] text-ink-2"
            title={p.last_screen_id}
          >
            {p.last_screen_id.slice(0, 8)}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-3">none</span>
        )}
      </Cell>
      <Cell className="max-md:absolute max-md:top-2.5 max-md:right-2">
        <span className="flex items-center justify-end gap-1">
          {p.kind === "upload" && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${p.name}`}
              className="rounded-full text-ink-3 hover:bg-bad/10 hover:text-bad"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <TrashIcon />
            </Button>
          )}
          <ArrowRightIcon
            aria-hidden
            className="size-4 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-data-active:opacity-100 max-md:hidden"
          />
        </span>
      </Cell>
    </div>
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
  const { data: projects } = useProjects();
  const { setProject, setStep, setUploadName } = useUi();
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string>("");
  const options = [
    {
      id: "",
      label: "Upload CSV",
      meta: "gene · log2fc · stat · fdr",
      icon: <UploadSimpleIcon />,
    },
    ...SIGNATURES.map((s) => ({
      id: s.id as string,
      label: s.id,
      meta: s.name,
      icon: <FlaskIcon />,
    })),
  ];
  const builtin = signature
    ? projects?.find((p) => p.kind === "builtin" && p.signature_id === signature)
    : undefined;
  function openProject(p: Project) {
    setProject(p.id);
    setStep(p.n_ranked ? "candidates" : "screen");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-[18px] p-6 shadow-overlay sm:max-w-[460px]">
        <DialogHeader className="flex-row items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-primary">
            <FolderPlusIcon className="size-4" aria-hidden />
          </span>
          <DialogTitle className="font-heading text-[18px] font-normal tracking-[-0.02em]">
            New project
          </DialogTitle>
        </DialogHeader>
        <form
          id="new-project"
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!signature) {
              // Upload projects are created by the server once the CSV validates.
              setUploadName(name.trim());
              setStep("screen");
              onOpenChange(false);
              return;
            }
            // Each built-in signature has one project: open it, never duplicate it.
            if (builtin) openProject(builtin);
            else
              create.mutate(
                { name: signature, signature_id: signature },
                { onSuccess: openProject },
              );
          }}
        >
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-[12px] text-ink-3">Signature</legend>
            {options.map((o) => {
              const on = signature === o.id;
              return (
                <button
                  key={o.id || "upload"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSignature(o.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:size-4",
                    on
                      ? SELECTED
                      : "bg-frost/55 ring-1 ring-rim/80 hover:bg-primary/8",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full [&>svg]:size-4",
                      on ? "bg-white/20 text-white" : "bg-accent-soft text-primary",
                    )}
                    aria-hidden
                  >
                    {o.icon}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] font-medium",
                      o.id && "font-mono",
                      on ? "text-white" : "text-ink",
                    )}
                  >
                    {o.label}
                  </span>
                  <span
                    className={cn(
                      "ml-auto truncate text-[12px]",
                      on ? "text-white/85" : "text-ink-3",
                    )}
                  >
                    {o.meta}
                  </span>
                  {on ? (
                    <CheckCircleIcon weight="fill" className="text-white" aria-hidden />
                  ) : (
                    <CircleIcon className="text-ink-3" aria-hidden />
                  )}
                </button>
              );
            })}
          </fieldset>
          <label className={cn("grid gap-1.5", signature && "hidden")}>
            <span className="text-[12px] text-ink-3">Name</span>
            <Input
              required={!signature}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={FIELD}
            />
          </label>
        </form>
        <DialogFooter className="mx-0 mb-0 items-center rounded-none border-0 bg-transparent p-0 sm:justify-between">
          <span className="flex items-center gap-2">
            <PreregBadge on={signature === FROZEN_SIGNATURE} />
            {create.error && (
              <StatusBadge tone="bad">Project unavailable</StatusBadge>
            )}
          </span>
          <Button
            type="submit"
            form="new-project"
            disabled={(!signature && !name.trim()) || create.isPending}
          >
            {signature ? <ArrowRightIcon /> : <UploadSimpleIcon />}
            {create.isPending
              ? "Creating"
              : signature
                ? "Open project"
                : "Choose CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: Project | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const remove = useDeleteProject();
  return (
    <Dialog
      open={!!project}
      onOpenChange={(v) => {
        if (!v) {
          remove.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="gap-5 rounded-[18px] p-6 shadow-overlay sm:max-w-[420px]">
        <DialogHeader className="flex-row items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bad/10 text-bad">
            <TrashIcon className="size-4" aria-hidden />
          </span>
          <DialogTitle className="font-heading text-[18px] font-normal tracking-[-0.02em]">
            Delete {project?.name}?
          </DialogTitle>
        </DialogHeader>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl bg-frost/55 px-4 py-3 text-[12.5px] ring-1 ring-rim/80">
          <dt className="text-ink-3">Ranked</dt>
          <dd className="m-0 font-mono text-ink-2">
            {num(project?.n_ranked) ?? "not screened"}
          </dd>
          <dt className="text-ink-3">Removes</dt>
          <dd className="m-0 text-ink-2">uploaded signature, screens, ranking</dd>
        </dl>
        <DialogFooter className="mx-0 mb-0 items-center rounded-none border-0 bg-transparent p-0 sm:justify-between">
          <span>
            {remove.error && (
              <StatusBadge tone="bad">{remove.error.message}</StatusBadge>
            )}
          </span>
          <span className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!project || remove.isPending}
              onClick={() =>
                project &&
                remove.mutate(project.id, {
                  onSuccess: () => {
                    onDeleted(project.id);
                    onClose();
                  },
                })
              }
            >
              <TrashIcon />
              {remove.isPending ? "Deleting" : "Delete project"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
