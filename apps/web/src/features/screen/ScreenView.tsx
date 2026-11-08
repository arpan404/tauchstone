import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CircleIcon,
  DotsNineIcon,
  DownloadSimpleIcon,
  FileCsvIcon,
  FlaskIcon,
  HourglassIcon,
  ListNumbersIcon,
  PlayIcon,
  SpinnerGapIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "cn";
import {
  startScreen,
  TEMPLATE_CSV_URL,
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
  StatusBadge,
  type Tone,
  type WellState,
} from "@/components/system";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CellLinePanel } from "./CellLinePanel";
import { FROZEN_SIGNATURE, SIGNATURES } from "./signatures";

const SLOTS = 10;
const GOLD = 113310;
const SPIN = "animate-spin motion-reduce:animate-none";
type StatusIcon = typeof CircleIcon;
/** Label, tone, icon and whether the icon spins (work in progress). */
const STATUS: Record<Screen["status"] | "idle", [string, Tone, StatusIcon, boolean]> = {
  idle: ["Ready", "neutral", CircleIcon, false],
  queued: ["Queued", "neutral", HourglassIcon, false],
  mapping: ["Matching genes", "accent", SpinnerGapIcon, true],
  scoring: ["Scoring", "accent", SpinnerGapIcon, true],
  aggregating: ["Combining per drug", "accent", SpinnerGapIcon, true],
  done: ["Done", "ok", CheckCircleIcon, false],
  failed: ["Failed", "bad", XCircleIcon, false],
};
const METHOD = [
  ["Library", "LINCS L1000, quality-filtered"],
  ["Genes", "978 measured genes"],
  ["Scores", "WTCS, KS, cosine"],
  ["Filter", "Clinical-stage drugs"],
] as const;
/** Selected tile: solid blue pill from the Nov 8 brief (no drop shadow, inner highlight only). */
const SELECTED =
  "bg-gradient-to-b from-[#2b6fd3] to-[#1453ad] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)]";
const TILE = "bg-frost/55 ring-1 ring-rim/80";
/** PlateMap empty wells as soft tinted fills instead of grey outlined circles. */
const SOFT_WELLS =
  "[&_.bg-surface-2]:border-transparent [&_.bg-surface-2]:bg-ink/[0.06]";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ScreenView() {
  const { data: projects } = useProjects();
  const {
    currentProjectId,
    setProject,
    setStep,
    selectCandidate,
    uploadName,
    setUploadName,
  } = useUi();
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
  const total = job?.n_signatures || GOLD;
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
  const [statusLabel, statusTone, StatusGlyph, spinning] =
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
    const previous = project.id;
    try {
      // Keep uploads and alternate cohorts out of an existing cohort's results.
      let next: Screen;
      let created = false;
      if (file) {
        // The server creates the project only once the CSV validates; an empty upload
        // project made earlier is reused.
        const empty = project.kind === "upload" && !project.last_screen_id;
        const name = uploadName?.trim() || file.name.replace(/\.csv$/i, "");
        next = await startScreen(
          project.id,
          signature,
          file,
          empty ? { projectId: project.id } : { name },
        );
        created = !empty;
        setUploadName(null);
        void qc.invalidateQueries({ queryKey: ["projects"] });
      } else {
        // One project per built-in signature: reuse it, never duplicate.
        const target =
          project.signature_id === signature
            ? project
            : (projects?.find(
                (p) => p.kind === "builtin" && p.signature_id === signature,
              ) ??
              (await createProject.mutateAsync({
                name: signature,
                signature_id: signature,
              })));
        next = await startScreen(target.id, signature, null);
      }
      setProject(next.project_id);
      setJob(next);
      stop.current = watchScreen(
        next,
        (event) => {
          setJob(event);
          if (event.status === "done") {
            void qc.invalidateQueries({ queryKey: ["projects"] });
            void qc.invalidateQueries({ queryKey: ["project-candidates"] });
            void qc.invalidateQueries({ queryKey: ["drug"] });
          }
          if (event.status === "failed" && created) {
            // The server removes a new upload project whose first screen fails.
            setProject(previous);
            void qc.invalidateQueries({ queryKey: ["projects"] });
          }
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
  const builtin = SIGNATURES.find((s) => s.id === signature);
  const title = file
    ? file.name.replace(/\.csv$/i, "")
    : uploadName && !source
      ? uploadName
      : builtin
        ? cap(builtin.name)
        : signature;
  const eyebrow = file || (uploadName && !source) ? "Uploaded CSV" : signature;
  return (
    <div className="grid gap-4 p-6 max-md:gap-3 max-md:p-3.5">
      <section
        aria-labelledby="screen-title"
        className="glass @container relative overflow-hidden px-7 py-6 max-md:px-5 max-md:py-5"
      >
        <p className="sr-only" aria-live="polite">
          {statusLabel}
        </p>
        <div className="grid gap-x-10 gap-y-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)] @6xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
          <div className="flex min-w-0 flex-col">
            <p className="m-0 flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
              <DotsNineIcon className="size-4 text-primary" aria-hidden />
              Screen · {eyebrow}
            </p>
            <h1
              id="screen-title"
              className="m-0 mt-2 truncate font-heading text-[44px] leading-[1.06] font-normal tracking-[-0.035em] text-ink max-md:text-[32px]"
            >
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone}>
                <StatusGlyph
                  weight={statusTone === "ok" || statusTone === "bad" ? "fill" : "regular"}
                  className={cn(spinning && SPIN)}
                  aria-hidden
                />
                {statusLabel}
              </StatusBadge>
              {workspaceMock() && (
                <StatusBadge tone="gap">Synthetic data</StatusBadge>
              )}
            </div>
            <dl
              aria-label="Method"
              className="m-0 mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-ink-2"
            >
              {METHOD.map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-full bg-frost/60 px-2.5 py-1 ring-1 ring-ink/[0.07]"
                >
                  <dt className="sr-only">{k}</dt>
                  <dd className="m-0">{v}</dd>
                </div>
              ))}
            </dl>
            <dl className="m-0 mt-8 flex flex-wrap items-end gap-x-9 gap-y-4 @4xl:mt-auto @4xl:pt-8">
              <div className="min-w-0">
                <dt className="text-[11.5px] text-ink-3">Signatures scored</dt>
                <dd className="m-0 mt-1 flex items-baseline gap-2 font-mono whitespace-nowrap tabular-nums">
                  <span className="text-[56px] leading-[0.92] font-normal tracking-[-0.045em] text-primary max-md:text-[42px]">
                    <NumberTicker value={job?.n_scored ?? 0} />
                  </span>
                  <span className="text-[13px] text-ink-3">
                    / {total.toLocaleString("en-US")}
                  </span>
                </dd>
              </div>
              <HeroMetric label="Elapsed">
                <NumberTicker
                  value={job?.elapsed_s ?? 0}
                  format={(v) => v.toFixed(1)}
                />
                <span className="ml-1 text-[12px] text-ink-3">s</span>
              </HeroMetric>
              <HeroMetric label="Ranked">
                {done && job?.n_ranked != null ? (
                  <span className="text-primary">
                    <NumberTicker value={job.n_ranked} />
                    <span className="ml-1 text-[12px] text-ink-3">drugs</span>
                  </span>
                ) : (
                  <span className="text-ink-3">
                    {running ? "pending" : "none"}
                  </span>
                )}
              </HeroMetric>
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-2 max-md:flex-col-reverse max-md:items-stretch">
              <Button
                onClick={run}
                disabled={running || !project}
                variant={done ? "outline" : "default"}
                className={cn("h-10 px-5", running && "disabled:opacity-80")}
              >
                {running ? (
                  <SpinnerGapIcon className={SPIN} />
                ) : done ? (
                  <ArrowClockwiseIcon />
                ) : (
                  <PlayIcon weight="fill" />
                )}
                {running ? "Screening" : "Run screen"}
              </Button>
              {done && (
                <Button className="h-10 px-5" onClick={() => setStep("candidates")}>
                  Open candidates
                  <ArrowRightIcon />
                </Button>
              )}
            </div>
            {failure && (
              <div
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-xl bg-bad/8 px-3 py-2 ring-1 ring-bad/15"
              >
                <WarningCircleIcon className="size-4 shrink-0 text-bad" aria-hidden />
                <p className="m-0 min-w-0 flex-1 text-[12.5px] leading-snug text-bad">
                  {failure}
                </p>
                {!running && project && (
                  <Button variant="outline" size="sm" onClick={run}>
                    <ArrowClockwiseIcon />
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-3">
            <PlateMap
              wells={wells}
              className={cn("w-full", SOFT_WELLS)}
              label={`Screen progress ${Math.round(progress * 100)}%`}
            />
            <div className="flex items-center gap-4 pl-[17px] text-[11.5px] text-ink-3">
              <Legend className="bg-primary/35" label="Scored" />
              <Legend className="bg-ink/[0.08]" label="Pending" />
              <span className="ml-auto font-mono text-[11px]">
                1 well ≈ {Math.round(total / PLATE_WELLS)} signatures
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Below lg the columns dissolve so Top hits comes before the cell lines panel. */}
        <div className="contents lg:grid lg:min-w-0 lg:content-start lg:gap-4">
          <Panel
            icon={<FlaskIcon />}
            title="Signature source"
            caption="Alzheimer's vs control, one cohort per screen"
            actions={
              notPreregistered && (
                <StatusBadge tone="gap">
                  <WarningCircleIcon aria-hidden />
                  not preregistered
                </StatusBadge>
              )
            }
            bodyClassName="px-3 pt-2 pb-3"
          >
            <div role="group" aria-label="Signature source" className="grid gap-2">
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
                      "grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-xl px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                      on ? SELECTED : cn(TILE, "enabled:hover:bg-primary/8"),
                    )}
                  >
                    <Chip on={on}>
                      <FlaskIcon />
                    </Chip>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block font-mono text-[13px] font-medium",
                          on ? "text-white" : "text-ink",
                        )}
                      >
                        {s.id}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[13px]",
                          on ? "text-white/90" : "text-ink-2",
                        )}
                      >
                        {s.name}
                        <span
                          className={cn(
                            "ml-2 text-[12px]",
                            on ? "text-white/75" : "text-ink-3",
                          )}
                        >
                          {s.method}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-1 flex flex-wrap gap-x-3 font-mono text-[11px]",
                          on ? "text-white/75" : "text-ink-3",
                        )}
                      >
                        {s.meta.map((m) => (
                          <span key={m}>{m}</span>
                        ))}
                      </span>
                      {s.warning && (
                        <span className="mt-2 flex">
                          <Tooltip>
                            <TooltipTrigger render={<span />} className="inline-flex">
                              <StatusBadge
                                tone="gap"
                                className={cn(on && "bg-white")}
                              >
                                <WarningCircleIcon aria-hidden />
                                {s.warning.label}
                                <span className="sr-only">: {s.warning.detail}</span>
                              </StatusBadge>
                            </TooltipTrigger>
                            <TooltipContent side="right">{s.warning.detail}</TooltipContent>
                          </Tooltip>
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge
                        tone={s.badge.tone}
                        className={cn(on && "bg-white")}
                      >
                        {s.badge.label}
                      </StatusBadge>
                      <Check on={on} />
                    </span>
                  </button>
                );
              })}
              <div className="relative">
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
                    "grid cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 rounded-xl px-3.5 py-3 transition-colors has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
                    file ? SELECTED : cn(TILE, "hover:bg-primary/8"),
                    drag && "bg-primary/10 ring-2 ring-primary",
                    running && "cursor-not-allowed",
                  )}
                >
                  <Chip on={!!file}>
                    {file ? <FileCsvIcon /> : <UploadSimpleIcon />}
                  </Chip>
                  <span className="min-w-0 pr-36 max-md:pr-10">
                    <span
                      className={cn(
                        "block truncate text-[13px] font-medium",
                        file ? "text-white" : "text-ink",
                      )}
                    >
                      {file?.name ?? uploadName ?? "Upload CSV"}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[12px]",
                        file ? "text-white/80" : "text-ink-3",
                      )}
                    >
                      {drag ? "Release to use this file" : "Drop a file or browse"}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block font-mono text-[11px] whitespace-nowrap",
                        file ? "text-white/75" : "text-ink-3",
                      )}
                    >
                      gene · log2fc · stat · fdr
                    </span>
                  </span>
                  <input
                    aria-label="Upload signature CSV"
                    type="file"
                    accept=".csv,text/csv"
                    disabled={running}
                    className="sr-only"
                    onChange={(e) => chooseFile(e.target.files?.[0])}
                  />
                </label>
                <a
                  href={TEMPLATE_CSV_URL}
                  download="signature_template.csv"
                  className={cn(
                    "absolute top-2.5 right-3 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    file
                      ? "bg-white/20 text-white hover:bg-white/30"
                      : "bg-frost/70 text-primary ring-1 ring-ink/[0.08] hover:bg-primary/8",
                  )}
                >
                  <DownloadSimpleIcon className="size-3.5" aria-hidden />
                  <span className="max-md:sr-only">Download template</span>
                </a>
              </div>
            </div>
          </Panel>
          <CellLinePanel job={job} running={running} className="max-lg:order-last" />
        </div>

        <Panel
          icon={<ListNumbersIcon />}
          title="Top hits"
          caption={
            done
              ? "Reversal score"
              : top.length > 0
                ? "Provisional, still scoring"
                : running
                  ? "Waiting for scores"
                  : "None yet"
          }
          actions={
            done && (
              <StatusBadge tone="ok">
                <CheckCircleIcon weight="fill" aria-hidden />
                Final
              </StatusBadge>
            )
          }
          bodyClassName="px-2 pt-1 pb-2"
        >
          <ol aria-live="polite" className="relative m-0 grid list-none gap-0.5 p-0">
            {Array.from({ length: SLOTS }, (_, i) => {
              const hit = top[i];
              return (
                <li
                  key={i}
                  aria-hidden={hit ? undefined : true}
                  className="h-10"
                >
                  {hit ? (
                    <motion.button
                      key={hit.drug_id}
                      type="button"
                      initial={reduce ? false : { opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="mvp-hit group/hit grid h-full w-full grid-cols-[24px_minmax(0,1fr)_minmax(48px,32%)_52px] items-center gap-3 rounded-xl px-3 text-left outline-none transition-colors hover:bg-primary/6 focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => {
                        selectCandidate(hit.drug_id);
                        setStep("evidence");
                      }}
                    >
                      <span className="text-right font-mono text-[12px] text-ink-3 tabular-nums">
                        {hit.rank}
                      </span>
                      <span className="truncate text-[13.5px] font-medium text-ink group-hover/hit:text-primary">
                        {hit.name}
                      </span>
                      <span className="block h-1.5 rounded-full bg-ink/[0.05]" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-[#7ba6e8] to-[#1f5fc4] transition-[width] duration-300"
                          style={{ width: `${(Math.abs(hit.consensus) / maxScore) * 100}%` }}
                        />
                      </span>
                      <span className="text-right font-mono text-[12.5px] font-medium text-primary tabular-nums">
                        {hit.consensus.toFixed(2)}
                      </span>
                    </motion.button>
                  ) : (
                    <span className="grid h-full grid-cols-[24px_minmax(0,1fr)_minmax(48px,32%)_52px] items-center gap-3 px-3">
                      <span className="text-right font-mono text-[12px] text-ink-3/50 tabular-nums">
                        {i + 1}
                      </span>
                      <span
                        className="h-2 rounded-full bg-ink/[0.045]"
                        style={{ width: `${70 - ((i * 17) % 35)}%` }}
                      />
                      <span className="h-1.5 rounded-full bg-ink/[0.035]" />
                      <span />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function HeroMetric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="m-0 mt-1 font-mono text-[22px] leading-none font-normal whitespace-nowrap text-ink tabular-nums">
        {children}
      </dd>
    </div>
  );
}

/** Icon chip on a source tile; inverts on the selected (blue) tile. */
function Chip({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 place-items-center rounded-full [&>svg]:size-4",
        on ? "bg-white/20 text-white" : "bg-accent-soft text-primary",
      )}
    >
      {children}
    </span>
  );
}

/** Radio state for a source tile. */
function Check({ on }: { on: boolean }) {
  return on ? (
    <CheckCircleIcon weight="fill" className="size-[18px] text-white" aria-hidden />
  ) : (
    <CircleIcon className="size-[18px] text-ink-3" aria-hidden />
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
