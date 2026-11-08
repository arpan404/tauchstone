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
  useUi.setState({ selectedCandidateId: null, step: "candidates", compareIds: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup(
  patch: (body: ReturnType<typeof mockProjectCandidates>) => void = () => {},
) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url === "/api/health")
        return { ok: true, json: async () => ({ mock: true }) };
      const parsed = new URL(url, "http://localhost");
      const body = mockProjectCandidates(
        "project-1",
        Object.fromEntries(
          [...parsed.searchParams].map(([key, value]) => [
            key,
            key === "min_contexts" || key === "limit"
              ? Number(value)
              : value === "true",
          ]),
        ),
      );
      patch(body);
      return { ok: true, json: async () => body };
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
  expect(await screen.findByText("Showing 12 of 12")).toBeTruthy();
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
    await screen.findByText("Showing 12 of 12");
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
  await screen.findByText("Showing 1 of 1");
  expect(screen.getByText("1,816 ranked")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Brain-penetrant" }));
  expect(await screen.findByText("No candidates")).toBeTruthy();
  expect(screen.queryByText("Cholic acid")).toBeNull();
});
it("highlights the selected candidate and opens Compare from the compare bar", async () => {
  useUi.setState({ selectedCandidateId: "MOCK-0003" });
  setup();
  const cholic = (await screen.findByText("Cholic acid")).closest("tr")!;
  expect(cholic.getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("region", { name: "Compare selection" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare Cholic acid" }));
  const bar = screen.getByRole("region", { name: "Compare selection" });
  expect(
    within(bar).getByRole("button", { name: "Compare 1" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare Busulfan" }));
  expect(within(bar).getByText("Cholic acid, Busulfan")).toBeTruthy();
  fireEvent.click(within(bar).getByRole("button", { name: "Compare 2" }));
  expect(useUi.getState().step).toBe("compare");
  expect(useUi.getState().compareIds).toEqual(["MOCK-0003", "MOCK-0006"]);
});
it("caps compare at four and clears the selection", async () => {
  setup();
  await screen.findByText("Cholic acid");
  for (const name of ["Ticrynafen", "Nepafenac", "Cholic acid", "Bavisant"])
    fireEvent.click(screen.getByRole("checkbox", { name: `Compare ${name}` }));
  expect(useUi.getState().compareIds).toHaveLength(4);
  fireEvent.click(screen.getByRole("checkbox", { name: "Compare Busulfan" }));
  expect(useUi.getState().compareIds).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Clear compare" }));
  expect(useUi.getState().compareIds).toEqual([]);
});
it("labels a not-preregistered table once, in the filter bar", async () => {
  setup((body) => {
    body.preregistered = false;
    for (const c of body.candidates) c.preregistered = false;
  });
  const nepafenac = (await screen.findByText("Nepafenac")).closest("tr")!;
  expect(within(nepafenac).queryByText("not preregistered")).toBeNull();
  expect(screen.getAllByText("not preregistered")).toHaveLength(1);
  expect(within(nepafenac).getByText("predicted penetrant")).toBeTruthy();
});
it("still labels a single not-preregistered row in a preregistered table", async () => {
  setup((body) => {
    body.preregistered = true;
    for (const c of body.candidates) c.preregistered = true;
    body.candidates[1].preregistered = false;
  });
  const nepafenac = (await screen.findByText("Nepafenac")).closest("tr")!;
  expect(within(nepafenac).getByText("not preregistered")).toBeTruthy();
  expect(screen.getAllByText("not preregistered")).toHaveLength(1);
});

it("sorts loaded rows by column and marks the active sort", async () => {
  setup();
  await screen.findByText("Cholic acid");
  const names = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).queryAllByRole("button")[0]?.textContent);
  fireEvent.click(screen.getByRole("button", { name: /Contexts/ }));
  expect(names()[0]).toBe("Cholic acid"); // 13 contexts, most first
  expect(
    screen.getByRole("columnheader", { name: /Contexts/ }).getAttribute("aria-sort"),
  ).toBe("descending");
  fireEvent.click(screen.getByRole("button", { name: /Drug/ }));
  expect(names()[0]).toBe("Bavisant");
  fireEvent.click(screen.getByRole("button", { name: /Reversal/ }));
  expect(names()[0]).toBe("Ticrynafen"); // most negative first
});
it("shows Not screened with a Run screen action when the project has no ranking", async () => {
  setup((body) => {
    (body as { screen_id?: string | null }).screen_id = null;
    body.n_ranked = 0;
    body.candidates = [];
  });
  expect(await screen.findByText("Not screened")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Run screen/ }));
  expect(useUi.getState().step).toBe("screen");
});
it("loads more rows until every eligible drug is reachable", async () => {
  const urls = setup((body) => {
    body.n_total_eligible = 250;
    body.n_ranked = 250;
  });
  await screen.findByText("Showing 12 of 250");
  fireEvent.click(screen.getByRole("button", { name: "Show all 250" }));
  await waitFor(() => expect(urls.some((u) => u.includes("limit=250"))).toBe(true));
});
it("flags a withdrawn drug next to its approval status", async () => {
  setup((body) => {
    body.candidates[0].approval_status = {
      status: "approved",
      withdrawn: true,
      withdrawn_year: 1980,
      withdrawn_class: "hepatotoxicity",
      withdrawn_country: "France; United States",
      withdrawn_source: "ChEMBL 37",
    };
  });
  const row = (await screen.findByText("Ticrynafen")).closest("tr")!;
  expect(within(row).getByText("withdrawn 1980")).toBeTruthy();
  expect(within(row).getByText("Approved")).toBeTruthy();
});
