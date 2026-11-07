import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "./types";
import { api } from "./client";
import { isMockMode, mockApi } from "./mock";
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
    throw new Error(`${response.status} · ${path}`);
  }
  return response.json() as Promise<T>;
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
export async function startScreen(
  project_id: string,
  signature_id: string,
  file: File | null,
) {
  let init: RequestInit;
  if (file) {
    const body = new FormData();
    body.set("project_id", project_id);
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
    const job: Screen = {
      id: `mock-${crypto.randomUUID()}`,
      project_id,
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
