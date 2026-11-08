import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "./types";
import { api } from "./client";
import { isMockMode, mockApi } from "./mock";
import { useUi } from "@/store/ui";
export type Project = Schema<"Project">;
export type Screen = Schema<"Screen">;
const date = "2026-11-07T00:00:00Z";
let projects: Project[] = [
  {
    id: "gse132903",
    name: "Alzheimer's · middle temporal gyrus",
    kind: "builtin",
    signature_id: "GSE132903",
    description: "97 AD · 98 control · limma · 16,437 genes",
    n_ranked: 1816,
    n_attack_ready: 100,
    preregistered: true,
    created_at: date,
  },
  {
    id: "gse173955",
    name: "Alzheimer's · hippocampus",
    kind: "builtin",
    signature_id: "GSE173955",
    description: "8 AD · 10 control · RNA-seq · 14,958 genes",
    preregistered: false,
    created_at: date,
  },
];
const jobs = new Map<string, Screen>();
/**
 * Mock only, same rows as the API mock (services/api/app/services/jobs.py): real per-line
 * gold signature counts with synthetic scores.
 */
const MOCK_CELLS: [string, number, number, boolean][] = [
  ["MCF7", 14690, -4.31, false], ["VCAP", 11966, -3.87, false], ["PC3", 10576, -4.02, false],
  ["A375", 9165, -3.66, false], ["HA1E", 8182, -3.94, false], ["A549", 7695, -3.71, false],
  ["HT29", 7476, -3.58, false], ["HCC515", 4399, -3.42, false], ["HEPG2", 3720, -3.29, false],
  ["HELA", 3393, -3.35, false], ["YAPC", 3004, -3.12, false], ["NPC", 2314, -3.48, true],
  ["SKBR3", 1725, -2.97, false], ["HS578T", 1656, -2.88, false], ["MDAMB231", 1594, -2.91, false],
  ["MCF10A", 1592, -2.84, false], ["BT20", 1575, -2.79, false], ["ASC", 1327, -2.66, false],
  ["NEU", 1171, -3.05, true], ["HME1", 1137, -2.58, false], ["SKB", 870, -2.41, false],
  ["CD34", 745, -2.37, false], ["PHH", 744, -2.29, false], ["ASC.C", 635, -2.18, false],
];
function mockCellLines(progress: number): NonNullable<Screen["cell_lines"]> {
  return MOCK_CELLS.map(([cell_id, n, best, neural]) => ({
    cell_id,
    n_scored: Math.floor(n * progress),
    best_consensus: best,
    neural,
  }));
}
const hits = new Map<string, NonNullable<Screen["top"]>>();
let serverMock = false;
export function workspaceMock() {
  return isMockMode() || serverMock;
}
async function request<T>(
  path: string,
  init?: RequestInit,
  fallback?: () => T | Promise<T>,
): Promise<T> {
  if (isMockMode() && fallback) return fallback();
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    if ([404, 405, 501].includes(response.status) && fallback) {
      const health = await api<{ mock: boolean }>("/health");
      if (health.mock) {
        serverMock = true;
        return fallback();
      }
    }
    throw new Error(await errorDetail(response));
  }
  return response.json() as Promise<T>;
}
/** The server's own error text (FastAPI `detail`), else the status code. */
export async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const { detail } = body;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === "string") return first.msg;
    }
  } catch {
    // Not JSON: fall through to the status line.
  }
  return `Request failed (${response.status})`;
}
/** URL of an example upload CSV that passes validation. */
export const TEMPLATE_CSV_URL = "/api/screens/template.csv";
/** The open project, or the first project (preregistered primary) when none is chosen. */
export function useCurrentProject() {
  const { data } = useProjects();
  const currentProjectId = useUi((s) => s.currentProjectId);
  return data?.find((p) => p.id === currentProjectId) ?? data?.[0] ?? null;
}
export function useCurrentProjectId() {
  const currentProjectId = useUi((s) => s.currentProjectId);
  return useCurrentProject()?.id ?? currentProjectId ?? undefined;
}
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () =>
      request<Project[]>("/projects", undefined, () => [...projects]),
    retry: false,
  });
}
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; signature_id: string | null }) =>
      request<Project>(
        "/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        () => {
          const p: Project = {
            id: crypto.randomUUID(),
            ...body,
            kind: body.signature_id ? "builtin" : "upload",
            preregistered: false,
            created_at: new Date().toISOString(),
          };
          projects = [...projects, p];
          return p;
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string; deleted: boolean }>(
        `/projects/${encodeURIComponent(id)}`,
        { method: "DELETE" },
        () => {
          projects = projects.filter((p) => p.id !== id);
          return { id, deleted: true };
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
/**
 * Start a screen. A file goes with `upload.name` (the server creates the project only after
 * the CSV validates) or with `upload.projectId` of an existing, empty upload project.
 */
export async function startScreen(
  project_id: string,
  signature_id: string,
  file: File | null,
  upload?: { name: string } | { projectId: string },
) {
  let init: RequestInit;
  if (file) {
    const body = new FormData();
    if (upload && "name" in upload) body.set("name", upload.name);
    else body.set("project_id", upload?.projectId ?? project_id);
    body.set("file", file);
    init = { method: "POST", body };
  } else
    init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id, signature_id }),
    };
  return request<Screen>("/screens", init, async () => {
    const pool = isMockMode()
      ? await mockApi.listCandidates()
      : await api<Schema<"CandidateList">>("/candidates");
    let target = project_id;
    if (file && upload && "name" in upload) {
      target = crypto.randomUUID();
      projects = [
        ...projects,
        {
          id: target,
          name: upload.name,
          signature_id: null,
          kind: "upload",
          preregistered: false,
          created_at: new Date().toISOString(),
        },
      ];
    }
    const job: Screen = {
      id: `mock-${crypto.randomUUID()}`,
      project_id: target,
      signature_id: file ? null : signature_id,
      status: "queued",
      n_signatures: 113310,
      n_scored: 0,
      elapsed_s: 0,
      top: [],
      preregistered: false,
    };
    hits.set(
      job.id,
      pool.candidates
        .slice(0, 5)
        .map((c) => ({
          rank: c.rank,
          name: c.name,
          drug_id: c.id,
          consensus: c.consensus,
        })),
    );
    jobs.set(job.id, job);
    return job;
  });
}
export function watchScreen(
  job: Screen,
  onEvent: (event: Screen) => void,
  onError: () => void,
) {
  if (jobs.has(job.id)) {
    const top = hits.get(job.id) ?? [];
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
      const progress = Math.min(1, tick / 20);
      const next: Screen = {
        ...job,
        status: progress === 1 ? "done" : "scoring",
        n_scored: Math.round(job.n_signatures * progress),
        elapsed_s: tick * 0.3,
        n_ranked: progress === 1 ? 1816 : null,
        top: top.slice(0, Math.floor(progress * top.length)),
        cell_lines: mockCellLines(progress),
        n_cell_lines: 83,
      };
      jobs.set(job.id, next);
      if (progress === 1) {
        projects = projects.map((p) =>
          p.id === job.project_id
            ? {
                ...p,
                n_ranked: 1816,
                n_attack_ready: 0,
                last_screen_id: job.id,
              }
            : p,
        );
        clearInterval(timer);
      }
      onEvent(next);
    }, 300);
    return () => clearInterval(timer);
  }
  const source = new EventSource(
    `/api/screens/${encodeURIComponent(job.id)}/events`,
  );
  const receive = (e: MessageEvent) => {
    try {
      const next = JSON.parse(e.data) as Screen;
      onEvent(next);
      if (next.status === "done" || next.status === "failed") source.close();
    } catch {
      source.close();
      onError();
    }
  };
  source.onmessage = receive;
  for (const name of ["progress", "done", "failed", "screen"])
    source.addEventListener(name, receive as EventListener);
  source.onerror = () => {
    source.close();
    onError();
  };
  return () => source.close();
}
