import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockProjectCandidates } from "@/api/mvpHooks";
import { useUi } from "@/store/ui";
import { RepurposingView } from "./RepurposingView";

beforeEach(() => {
  vi.stubEnv("VITE_USE_MOCK", "0");
  useUi.setState({ selectedCandidateId: null, step: "candidates" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup() {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === "/api/health")
        return { ok: true, json: async () => ({ mock: true }) };
      const parsed = new URL(url, "http://localhost");
      return {
        ok: true,
        json: async () =>
          mockProjectCandidates(
            "project-1",
            Object.fromEntries(
              [...parsed.searchParams].map(([key, value]) => [
                key,
                key === "min_contexts" ? Number(value) : value === "true",
              ]),
            ),
          ),
      };
    }),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RepurposingView projectId="project-1" />
    </QueryClientProvider>,
  );
  return urls;
}
it("sends each filter to the project API and preserves Cholic acid neural evidence", async () => {
  const urls = setup();
  expect(await screen.findByText("12 of 1,816")).toBeTruthy();
  const cholic = screen.getByText("Cholic acid").closest("tr")!;
  expect(within(cholic).getByText("NEU -0.66")).toBeTruthy();
  for (const [label, parameter] of [
    ["Approved", "approved=true"],
    ["Brain-cell data", "brain_cells=true"],
    ["Brain-penetrant", "penetrant=true"],
    ["≥ 5 contexts", "min_contexts=5"],
  ]) {
    const chip = screen.getByRole("button", { name: label });
    fireEvent.click(chip);
    await waitFor(() =>
      expect(
        urls.some((url) =>
          url.includes(`/projects/project-1/candidates?${parameter}`),
        ),
      ).toBe(true),
    );
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip);
    await screen.findByText("12 of 1,816");
  }
});
it("opens the selected drug from a row and keeps comparison checkbox clicks in Candidates", async () => {
  setup();
  const drug = await screen.findByRole("button", { name: "Piperacillin" });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Compare Piperacillin" }),
  );
  expect(screen.getByText("Compare 1")).toBeTruthy();
  expect(useUi.getState().step).toBe("candidates");
  fireEvent.click(drug.closest("tr")!);
  expect(useUi.getState().selectedCandidateId).toBe("MOCK-0005");
  expect(useUi.getState().step).toBe("evidence");
});
it("shows an empty state for combined filters without substituting unfiltered rows", async () => {
  setup();
  await screen.findByText("Cholic acid");
  fireEvent.click(screen.getByRole("button", { name: "Brain-cell data" }));
  await screen.findByText("1 of 1,816");
  fireEvent.click(screen.getByRole("button", { name: "Brain-penetrant" }));
  expect(await screen.findByText("No candidates")).toBeTruthy();
  expect(screen.queryByText("Cholic acid")).toBeNull();
});
