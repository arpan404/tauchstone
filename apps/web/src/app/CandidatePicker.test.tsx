import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUi } from "@/store/ui";
import { CandidatePicker, MAX_RENDERED } from "./CandidatePicker";

const pool = Array.from({ length: 1816 }, (_, i) => ({
  id: `BRD-${i + 1}`,
  name: i + 1 === 684 ? "Donepezil" : `Drug ${i + 1}`,
  rank: i + 1,
  consensus: -1 + i / 2000,
}));
vi.mock("@/api/mvpHooks", async (orig) => ({
  ...(await orig<typeof import("@/api/mvpHooks")>()),
  useProjectCandidates: (_p: string, filters: { limit?: number }) => ({
    data: { candidates: pool.slice(0, filters.limit), n_ranked: pool.length },
  }),
}));
vi.mock("@/api/hooks", () => ({ useCandidates: () => ({ data: undefined }) }));
HTMLElement.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubEnv("VITE_USE_MOCK", "0");
  useUi.setState({ selectedCandidateId: null, currentProjectId: "GSE132903" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function open() {
  render(<CandidatePicker />);
  fireEvent.click(screen.getByRole("button", { name: "Choose drug" }));
  return screen.getByPlaceholderText("Search drug, brand or BRD id");
}

it("searches the whole ranked pool and caps the rendered rows", () => {
  const input = open();
  expect(screen.getByText("Ranked drugs · 1,816")).toBeTruthy();
  expect(screen.getAllByRole("option")).toHaveLength(MAX_RENDERED);
  fireEvent.change(input, { target: { value: "donepezil" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  fireEvent.click(screen.getByText("Donepezil"));
  expect(useUi.getState().selectedCandidateId).toBe("BRD-684");
});

it("resolves a brand name through the lookup when nothing matches locally", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => [{ query: "Aricept", status: "ranked", drug_id: "BRD-684", name: "Donepezil",
      pool_rank: 684, attack_ready: false, preregistered: false }],
  }));
  vi.stubGlobal("fetch", fetcher);
  const input = open();
  fireEvent.change(input, { target: { value: "Aricept" } });
  expect(await screen.findByText("Name lookup")).toBeTruthy();
  expect(screen.getByText("#684")).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith("/api/lookup", expect.objectContaining({ method: "POST" }));
  fireEvent.click(screen.getByText("Donepezil"));
  expect(useUi.getState().selectedCandidateId).toBe("BRD-684");
});

it("labels a name the lookup cannot resolve", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, json: async () => [{ query: "zzqx", status: "unrecognized", attack_ready: false, preregistered: false }],
  })));
  const input = open();
  fireEvent.change(input, { target: { value: "zzqx" } });
  expect(await screen.findByText("name not recognised")).toBeTruthy();
});
