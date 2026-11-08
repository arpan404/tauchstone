import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  FileCsvIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import {
  startScreen,
  useProjects,
  useCreateProject,
  watchScreen,
  workspaceMock,
  type Screen,
} from "@/api/workspace";
import { useUi } from "@/store/ui";
import {
  NumberTicker,
  Panel,
  PlateMap,
  PLATE_WELLS,
  Readout,
  StatusBadge,
  type Tone,
  type WellState,
} from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dot } from "./Dot";
import { FROZEN_SIGNATURE, SIGNATURES } from "./signatures";

type SimulationProps = {
  state: "idle" | "scoring" | "done";
  progress: number;
  height?: number;
};
const simulations = import.meta.glob("../simulation/CellSimulation.tsx");
const loader = simulations["../simulation/CellSimulation.tsx"];
const Simulation = loader
  ? lazy(async () => {
      const m = (await loader()) as {
        CellSimulation: ComponentType<SimulationProps>;
      };
      return { default: m.CellSimulation };
    })
  : null;

const SLOTS = 10;
const STATUS: Record<Screen["status"] | "idle", [string, Tone]> = {
  idle: ["Ready", "neutral"],
  queued: ["Queued", "neutral"],
  mapping: ["Mapping genes", "accent"],
  scoring: ["Scoring", "accent"],
  aggregating: ["Aggregating", "accent"],
  done: ["Done", "ok"],
  failed: ["Failed", "bad"],
};
const METHOD = [
  ["Library", "LINCS L1000 gold"],
  ["Genes", "978 landmark"],
  ["Scores", "WTCS · KS · cosine"],
  ["Filter", "Clinical stage"],
] as const;

export function ScreenView() {
  const { data: projects } = useProjects();
  const { currentProjectId, setProject, setStep, selectCandidate } = useUi();
  const project =
    projects?.find((p) => p.id === currentProjectId) ?? projects?.[0];
  const [source, setSource] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Screen | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const qc = useQueryClient();
  const createProject = useCreateProject();
  const reduce = useReducedMotion();
  const signature = source ?? project?.signature_id ?? FROZEN_SIGNATURE;
  const running = busy || (!!job && !["done", "failed"].includes(job.status));
  const progress = job ? job.n_scored / Math.max(1, job.n_signatures) : 0;
  const done = job?.status === "done";
  const top = useMemo(() => (job?.top ?? []).slice(0, SLOTS), [job?.top]);
  const maxScore = Math.max(1e-6, ...top.map((h) => Math.abs(h.consensus)));
  const wells = useMemo<WellState[]>(() => {
    // Wells show progress only (each ≈ 1/384 of the gold signatures, in scoring order).
    // Hits are not placed on the plate: a well is not a drug.
    const filled = Math.round(progress * PLATE_WELLS);
    return Array.from({ length: PLATE_WELLS }, (_, i) =>
      i < filled
        ? "scored"
        : running && i === filled
          ? "next"
          : "empty",
    );
  }, [progress, running]);
  const [statusLabel, statusTone] =
    STATUS[busy && !job ? "queued" : (job?.status ?? "idle")];
  useEffect(() => () => stop.current?.(), []);
  function chooseFile(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("CSV required");
      return;
    }
    setError("");
    setFile(f);
    setJob(null);
  }
  async function run() {
    if (!project) return;
    setBusy(true);
    setError("");
    setJob(null);
    stop.current?.();
    try {
      // Keep uploads and alternate cohorts out of an existing cohort's results.
      const matches = file
        ? project.kind === "upload" && !project.last_screen_id
        : project.signature_id === signature;
      const target = matches
        ? project
        : await createProject.mutateAsync({
            name: file ? file.name.replace(/\.csv$/i, "") : signature,
            signature_id: file ? null : signature,
          });
      setProject(target.id);
      const next = await startScreen(target.id, signature, file);
      setJob(next);
      stop.current = watchScreen(
        next,
        (event) => {
          setJob(event);
          if (event.status === "done")
            void qc.invalidateQueries({ queryKey: ["projects"] });
        },
        () => {
          setError("Connection interrupted");
          setJob((j) => (j ? { ...j, status: "failed" } : j));
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screen unavailable");
    } finally {
      setBusy(false);
    }
  }
  const notPreregistered =
    file || signature !== FROZEN_SIGNATURE || !project?.preregistered;
  const failure = error || job?.error;
  return (
    <div className="p-6 max-md:p-3.5">
      <div className="grid gap-4 lg:grid-cols-[288px_minmax(0,1fr)] min-[1400px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Panel
            title="Signature"
            flush
            actions={
              <>
                {workspaceMock() && (
                  <StatusBadge tone="gap">Synthetic data</StatusBadge>
                )}
                {notPreregistered && (
                  <StatusBadge tone="gap">not preregistered</StatusBadge>
                )}
              </>
            }
          >
            <div role="group" aria-label="Signature source">
              {SIGNATURES.map((s) => {
                const on = !file && signature === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={running}
                    aria-pressed={on}
                    onClick={() => {
                      setSource(s.id);
                      setFile(null);
                      setJob(null);
                    }}
                    className={cn(
                      "relative grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line px-4 py-2.5 text-left outline-none transition-colors focus-visible:bg-surface-2 disabled:cursor-not-allowed",
                      on ? "bg-accent-soft/50" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="mt-0.5">
                      <Dot on={on} />
                    </span>
                    <span className="font-mono text-[13px] font-medium text-ink">
                      {s.id}
                    </span>
                    <StatusBadge tone={s.badge.tone}>
                      {s.badge.label}
                    </StatusBadge>
                    <span className="col-span-2 col-start-2 text-[13px] text-ink-2">
                      {s.name}
                      <span className="ml-2 text-[12px] text-ink-3">{s.method}</span>
                    </span>
                    <span className="col-span-2 col-start-2 mt-1 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-3 font-mono text-[11px] text-ink-3">
                      {s.meta.map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </span>
                  </button>
                );
              })}
              <label
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!running) setDrag(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  if (!running) chooseFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line px-4 py-2.5 transition-colors has-[input:focus-visible]:bg-surface-2",
                  file ? "bg-accent-soft/50" : "hover:bg-surface-2",
                  drag && "bg-accent-soft outline-2 -outline-offset-2 outline-dashed outline-primary",
                  running && "cursor-not-allowed",
                )}
              >
                <Dot on={!!file} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {file?.name ?? "Upload CSV"}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-3">
                    gene · log2fc · stat · fdr
                  </span>
                </span>
                {file ? (
                  <FileCsvIcon className="size-4 text-primary" />
                ) : (
                  <UploadSimpleIcon className="size-4 text-ink-3" />
                )}
                <input
                  aria-label="Upload signature CSV"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={running}
                  className="sr-only"
                  onChange={(e) => chooseFile(e.target.files?.[0])}
                />
              </label>
            </div>
            <dl
              aria-label="Method"
              className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 font-mono text-[11px] text-ink-2"
            >
              {METHOD.map(([k, v]) => (
                <div key={k} className="flex min-w-0 items-baseline gap-2">
                  <dt className="sr-only">{k}</dt>
                  <dd className="m-0 truncate">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-line p-4">
              <Button
                onClick={run}
                disabled={running || !project}
                className="h-10 w-full text-[14px]"
              >
                {running ? "Screening" : "Run screen"}
              </Button>
              {failure && (
                <div role="alert" className="mt-3 flex items-center gap-2">
                  <StatusBadge tone="bad" className="min-w-0 truncate">
                    {failure}
                  </StatusBadge>
                  {!running && project && (
                    <Button variant="outline" size="sm" onClick={run}>
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Panel>
          <Panel
            title="Cell model"
            flush
            actions={<StatusBadge>Illustration</StatusBadge>}
            className="overflow-hidden"
          >
            <div className="[&>div]:rounded-none [&>div]:border-0">
              <Suspense fallback={<Skeleton className="h-[160px] rounded-none" />}>
                {Simulation ? (
                  <Simulation
                    state={done ? "done" : running ? "scoring" : "idle"}
                    progress={progress}
                    height={160}
                  />
                ) : (
                  <div className="h-[160px] bg-surface-2" />
                )}
              </Suspense>
            </div>
          </Panel>
        </div>

        <Panel
          title="Plate"
          flush
          className="@container flex flex-col [&>div:last-child]:flex [&>div:last-child]:flex-1 [&>div:last-child]:flex-col"
          actions={
            <>
              <StatusBadge tone={statusTone}>
                {statusLabel}
              </StatusBadge>
              {done && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("candidates")}
                >
                  Open candidates
                  <ArrowRightIcon />
                </Button>
              )}
            </>
          }
        >
          <p className="sr-only" aria-live="polite">
            {statusLabel}
          </p>
          <dl className="m-0 grid grid-cols-1 border-b border-line @2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] [&>div]:px-5 [&>div]:py-4 [&>div+div]:border-t @2xl:[&>div+div]:border-t-0 @2xl:[&>div+div]:border-l [&>div+div]:border-line">
            <div className="min-w-0">
              <dt className="text-[12px] text-ink-3">Signatures scored</dt>
              <dd className="m-0 flex items-baseline gap-2 whitespace-nowrap font-mono text-[44px] leading-none font-medium tracking-tight text-ink tabular-nums">
                <NumberTicker value={job?.n_scored ?? 0} />
                <span className="text-[13px] font-normal tracking-normal text-ink-3">
                  / {(job?.n_signatures ?? 113310).toLocaleString("en-US")}
                </span>
              </dd>
            </div>
            <Readout
              size="md"
              label="Elapsed"
              className="self-end"
              value={
                <NumberTicker
                  value={job?.elapsed_s ?? 0}
                  format={(v) => v.toFixed(1)}
                />
              }
              unit="s"
            />
            <Readout
              size="md"
              label="Ranked"
              className="self-end"
              tone={done ? "accent" : "neutral"}
              value={<NumberTicker value={job?.n_ranked ?? 0} />}
              unit="drugs"
            />
          </dl>
          <div className="grid flex-1 @2xl:grid-cols-[minmax(0,1fr)_248px] @3xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col items-center justify-center gap-4 p-5 @2xl:px-6">
              <PlateMap
                wells={wells}
                className="w-full max-w-[720px]"
                label={`Screen progress ${Math.round(progress * 100)}%`}
              />
              <div className="flex w-full max-w-[720px] items-center gap-4 pl-[17px] text-[12px] text-ink-3">
                <Legend className="bg-primary/35" label="Scored" />
                <Legend className="border border-line bg-surface-2" label="Pending" />
                <span className="ml-auto font-mono text-[11px]">1 well ≈ {Math.round((job?.n_signatures ?? 113310) / PLATE_WELLS)} signatures</span>
              </div>
            </div>
            <section
              aria-label="Top hits"
              className="min-w-0 border-t border-line @2xl:border-t-0 @2xl:border-l"
            >
              <header className="flex h-10 items-center justify-between border-b border-line px-4">
                <h4 className="text-[12px] font-medium text-ink-3">Top hits</h4>
                {top.length > 0 && !done && (
                  <span className="text-[11px] text-ink-3">provisional</span>
                )}
              </header>
              <ol aria-live="polite" className="relative m-0 list-none p-0">
                {Array.from({ length: SLOTS }, (_, i) => {
                  const hit = top[i];
                  return (
                    <li
                      key={i}
                      aria-hidden={hit ? undefined : true}
                      className="h-[38px] border-b border-line last:border-b-0"
                    >
                      {hit ? (
                        <motion.button
                          key={hit.drug_id}
                          type="button"
                          initial={reduce ? false : { opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          className="mvp-hit group/hit grid-cols-[24px_minmax(0,1fr)_48px]! @3xl:grid-cols-[24px_minmax(0,1fr)_44px_48px]! mt-0! h-full w-full items-center rounded-none! border-0! bg-transparent! px-4! py-0! text-left outline-none hover:bg-surface-2! focus-visible:bg-surface-2!"
                          onClick={() => {
                            selectCandidate(hit.drug_id);
                            setStep("evidence");
                          }}
                        >
                          <span className="font-mono text-[12px] text-ink-3 tabular-nums">
                            {hit.rank}
                          </span>
                          <span className="truncate text-[13px] font-medium text-ink group-hover/hit:text-accent-ink">
                            {hit.name}
                          </span>
                          <span className="hidden h-1.5 rounded-sm bg-surface-2 @3xl:block" aria-hidden>
                            <span
                              className="block h-full rounded-sm bg-primary/60 transition-[width] duration-300"
                              style={{ width: `${(Math.abs(hit.consensus) / maxScore) * 100}%` }}
                            />
                          </span>
                          <span className="text-right font-mono text-[12.5px] font-medium text-primary tabular-nums">
                            {hit.consensus.toFixed(2)}
                          </span>
                        </motion.button>
                      ) : (
                        <span className="grid h-full grid-cols-[24px_minmax(0,1fr)] items-center px-4">
                          <span className="font-mono text-[12px] text-ink-3/50 tabular-nums">
                            {i + 1}
                          </span>
                          <span className="h-1.5 w-20 rounded-sm bg-surface-2" />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}
