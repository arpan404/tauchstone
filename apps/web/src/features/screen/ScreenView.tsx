import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  startScreen,
  useProjects,
  useCreateProject,
  watchScreen,
  workspaceMock,
  type Screen,
} from "@/api/workspace";
import { useUi } from "@/store/ui";
import { Action, Chip } from "@/components/mvp";
type SimulationProps = { state: "idle" | "scoring" | "done"; progress: number };
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
  const stop = useRef<(() => void) | null>(null);
  const qc = useQueryClient();
  const createProject = useCreateProject();
  const signature = source ?? project?.signature_id ?? "GSE132903";
  const running = busy || (!!job && !["done", "failed"].includes(job.status));
  const progress = job ? job.n_scored / Math.max(1, job.n_signatures) : 0;
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
  return (
    <div className="mvp-view">
      <div className="mvp-grid">
        <section>
          <h2 className="mvp-heading">Disease signature</h2>
          {[
            {
              id: "GSE132903",
              name: "middle temporal gyrus",
              meta: "97 AD · 98 control · limma · 16,437 genes",
            },
            {
              id: "GSE173955",
              name: "hippocampus",
              meta: "8 AD · 10 control · RNA-seq · 14,958 genes",
            },
          ].map((s) => (
            <button
              key={s.id}
              disabled={running}
              className="mvp-option"
              aria-pressed={!file && signature === s.id}
              onClick={() => {
                setSource(s.id);
                setFile(null);
                setJob(null);
              }}
            >
              <span className="mvp-radio" />
              <span>
                <b>
                  {s.id} · {s.name}
                </b>
                <span className="mvp-muted block">{s.meta}</span>
              </span>
              <Chip tone={s.id === "GSE132903" ? "ok" : "gap"}>
                {s.id === "GSE132903" ? "QC 7/7" : "held-out"}
              </Chip>
            </button>
          ))}
          <label
            className="mvp-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!running) chooseFile(e.dataTransfer.files[0]);
            }}
          >
            {file?.name ?? "Drop CSV · Browse"}
            <span className="mvp-muted block font-mono">
              gene · log2fc · stat · fdr
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
          <div className="mvp-chips mb-3.5">
            {[
              "LINCS gold · 113,310",
              "978 landmark genes",
              "Clinical stage",
              "WTCS · KS · cosine",
            ].map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
            {(file || signature !== "GSE132903" || !project?.preregistered) && (
              <Chip tone="gap">not preregistered</Chip>
            )}
            {workspaceMock() && <Chip tone="gap">Synthetic data</Chip>}
          </div>
          <Action onClick={run} disabled={running || !project}>
            {running ? "Screening" : "Run screen"}
          </Action>
          {error && (
            <div role="alert" className="mt-3">
              <Chip tone="bad">{error}</Chip>
            </div>
          )}
          {job?.error && (
            <div role="alert">
              <Chip tone="bad">{job.error}</Chip>
            </div>
          )}
          <progress
            className="mvp-progress mt-3.5"
            max={1}
            value={progress}
            aria-label="Screen progress"
          />
          <div
            className="mvp-muted flex justify-between mt-1.5"
            aria-live="polite"
          >
            <span>
              <b className="num">{(job?.n_scored ?? 0).toLocaleString()}</b>{" "}
              signatures scored
            </span>
            <span className="num">{(job?.elapsed_s ?? 0).toFixed(1)} s</span>
          </div>
        </section>
        <section>
          <Suspense fallback={<div className="mvp-simulation">Loading</div>}>
            {Simulation ? (
              <Simulation
                state={
                  job?.status === "done" ? "done" : running ? "scoring" : "idle"
                }
                progress={progress}
              />
            ) : (
              <div className="mvp-simulation">
                {job?.status === "done"
                  ? `${job.n_ranked?.toLocaleString()} ranked`
                  : running
                    ? "scoring"
                    : "idle"}
              </div>
            )}
          </Suspense>
          <div aria-live="polite">
            {job?.top?.map((hit) => (
              <button
                className="mvp-hit w-full text-left"
                key={hit.drug_id}
                onClick={() => {
                  selectCandidate(hit.drug_id);
                  setStep("evidence");
                }}
              >
                <span className="mvp-muted num">{hit.rank}</span>
                <b>{hit.name}</b>
                <span className="num text-primary text-right font-semibold">
                  {hit.consensus.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
          {job?.status === "done" && (
            <Action
              secondary
              className="mt-2"
              onClick={() => setStep("candidates")}
            >
              Open candidates
            </Action>
          )}
        </section>
      </div>
    </div>
  );
}
