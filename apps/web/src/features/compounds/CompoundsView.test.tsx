import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockLookup } from "@/api/mvpHooks";
import { useUi } from "@/store/ui";
import { CompoundsView } from "./CompoundsView";
beforeEach(() => {
  vi.stubEnv("VITE_USE_MOCK", "1");
  useUi.setState({ step: "candidates", selectedCandidateId: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <CompoundsView projectId="project-1" />
    </QueryClientProvider>,
  );
}
it("renders the supplied pool ranks, positive score, unavailable statuses and Attack readiness", async () => {
  setup();
  fireEvent.change(screen.getByLabelText("Paste compound names"), {
    target: {
      value:
        "donepezil, memantine\ngalantamine, rivastigmine, nepafenac, lithium",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  for (const rank of [
    "684 / 1,816",
    "502 / 1,816",
    "1,214 / 1,816",
    "2 / 1,816",
  ])
    expect(await screen.findByText(rank)).toBeTruthy();
  expect(screen.getByText("+0.21")).toBeTruthy();
  expect(screen.getByText("not rankable")).toBeTruthy();
  expect(screen.getByText("not in LINCS")).toBeTruthy();
  const row = screen.getByText("Nepafenac").closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Attack" }));
  expect(useUi.getState().selectedCandidateId).toBe("MOCK-0002");
  expect(useUi.getState().step).toBe("attack");
  expect(
    within(screen.getByText("donepezil").closest("tr")!).getByRole("button", {
      name: "Build tests",
    }),
  ).toBeTruthy();
});
it("posts comma/newline parsed names in order with project scope and clears stale results after editing", async () => {
  vi.stubEnv("VITE_USE_MOCK", "0");
  const fetch = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    json: async () =>
      url === "/api/health"
        ? { mock: true }
        : mockLookup(JSON.parse(String(init?.body))),
  }));
  vi.stubGlobal("fetch", fetch);
  setup();
  const textarea = screen.getByLabelText("Paste compound names");
  fireEvent.change(textarea, {
    target: { value: " donepezil,\n\n memantine, donepezil " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/lookup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          names: ["donepezil", "memantine", "donepezil"],
          project_id: "project-1",
        }),
      }),
    ),
  );
  await screen.findByText("502 / 1,816");
  fireEvent.change(textarea, { target: { value: "lithium" } });
  expect(screen.queryByText("502 / 1,816")).toBeNull();
});
