import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockDrug } from "@/api/mvpHooks";
import { useUi } from "@/store/ui";
import { ContextMap, EvidenceView } from "./EvidenceView";
vi.mock("../protein-viewer/ProteinPanel", () => ({
  ProteinPanel: ({ url }: { url: string | null }) => (
    <div>{url ?? "No structure available"}</div>
  ),
}));
beforeEach(() => {
  vi.stubEnv("VITE_USE_MOCK", "1");
  useUi.setState({ selectedCandidateId: "MOCK-0005", step: "evidence" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup(props = {}) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EvidenceView {...props} />
    </QueryClientProvider>,
  );
}
it("renders Piperacillin gaps, ranking contexts, resources, and hidden test count without outcomes", async () => {
  setup();
  await screen.findByRole("heading", { name: "Piperacillin" });
  for (const label of [
    "Cancer lines only",
    "10 µM only",
    "6 h only",
    "Brain exposure · predicted low",
    "No neural-line ranking data",
    "rank 5 / 1,816",
    "not available",
  ])
    expect(screen.getByText(label)).toBeTruthy();
  // The real molecule viewer loads lazily and renders the formula with subscripts.
  expect((await screen.findByTestId("molecule-formula")).textContent).toBe("C23H27N5O7S");
  const context = screen.getByRole("region", { name: "Ranking context map" });
  for (const cell of ["HT29", "MCF7", "VCAP"])
    expect(within(context).getByText(cell)).toBeTruthy();
  expect(screen.getByText("Hidden tests").nextElementSibling?.textContent).toBe(
    "3",
  );
  expect(screen.getByRole("button", { name: "Add API key" })).toBeTruthy();
  expect(
    screen.queryByText(/composition-adjusted|survived|failed/i),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Attack" }));
  expect(useUi.getState().step).toBe("attack");
});
it("labels non-preregistered drugs and calls shell actions with the selected drug ID", async () => {
  vi.stubEnv("VITE_USE_MOCK", "0");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/resources")
          ? []
          : url.includes("/health")
            ? { mock: true }
            : { ...mockDrug("MOCK-0005"), preregistered: false },
    })),
  );
  const onCompare = vi.fn(),
    onReport = vi.fn();
  setup({ onCompare, onReport });
  await screen.findByRole("heading", { name: "Piperacillin" });
  expect(screen.getByText("not preregistered")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Compare" }));
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(onCompare).toHaveBeenCalledWith("MOCK-0005");
  expect(onReport).toHaveBeenCalledWith("MOCK-0005");
});
it("keeps context-map combinations empty and retains multiple time points", () => {
  render(
    <ContextMap
      contexts={[
        {
          cell_id: "NEU",
          dose: "1 uM",
          time: "6 h",
          consensus: -0.6,
          neural: true,
        },
        {
          cell_id: "NEU",
          dose: "1 uM",
          time: "24 h",
          consensus: -0.7,
          neural: true,
        },
        { cell_id: "MCF7", dose: "10 uM", time: "6 h", consensus: -1.2 },
      ]}
    />,
  );
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.getByText("24 h")).toBeTruthy();
  expect(screen.getByText("Neural-line ranking data")).toBeTruthy();
});
