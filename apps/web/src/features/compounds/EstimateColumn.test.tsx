import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { badgeTip } from "@/components/system/badgeTips";
import { useUi } from "@/store/ui";
import { CompoundsView } from "./CompoundsView";
import fixture from "./estimateFixture.json";

beforeEach(() => {
  useUi.setState({ step: "candidates", selectedCandidateId: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <CompoundsView />
    </QueryClientProvider>,
  );
}
function rowFor(query: string): HTMLElement {
  const table = screen.getByRole("table", { name: "Compound results" });
  const row = within(table)
    .getAllByRole("row")
    .find((r) => r.querySelector("td")?.textContent === query);
  if (!row) throw new Error(`no row for ${query}`);
  return row;
}
const LOOKUP = [
  { query: "donepezil", status: "ranked", drug_id: "BRD-A49160188", name: "Donepezil", pool_rank: 684, rank_total: 1816, consensus: -0.2444, n_contexts: 6, attack_ready: false, preregistered: false },
  { query: "galantamine", status: "ranked", drug_id: "BRD-A49148672", name: "Galantamine", pool_rank: 1214, rank_total: 1816, consensus: 0.207, n_contexts: 4, attack_ready: false, preregistered: false },
  { query: "rivastigmine", status: "not_rankable", drug_id: "BRD-K10706131", name: "rivastigmine", attack_ready: false, preregistered: false },
  { query: "lithium", status: "not_in_lincs", drug_id: null, name: null, attack_ready: false, preregistered: false },
];
function stubServer(estimate: (ids: string[]) => Response) {
  vi.stubEnv("VITE_USE_MOCK", "0");
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/compounds/estimate") return estimate(JSON.parse(String(init?.body)).ids);
    return new Response(JSON.stringify(LOOKUP), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
/** Replace the default chips with a pasted list, then run the lookup. */
function check(names: string) {
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  fireEvent.paste(screen.getByLabelText("Compound names"), {
    clipboardData: { getData: () => names },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
}

it("shows the AI estimate column with basis tags and the measured score beside it (mock mode)", async () => {
  vi.stubEnv("VITE_USE_MOCK", "1");
  setup();
  check("donepezil, galantamine, nepafenac, lithium");
  expect(await screen.findByRole("columnheader", { name: "AI estimate" })).toBeTruthy();
  const donepezil = within(rowFor("donepezil"));
  expect(donepezil.getByText("in training")).toBeTruthy();
  expect(donepezil.getByText("measured")).toBeTruthy();
  expect(donepezil.getByLabelText("AI estimate -0.17")).toBeTruthy();
  expect(within(rowFor("galantamine")).getByText("held out")).toBeTruthy();
  expect(within(rowFor("nepafenac")).getByText("held out")).toBeTruthy();
  expect(within(rowFor("lithium")).queryByText(/AI /)).toBeNull();
  expect(screen.getByText("Estimated from structure. Exploratory, not part of the ranking.")).toBeTruthy();
  expect(screen.getByText("not preregistered")).toBeTruthy();
});

it("tags a fresh estimate as a new structure with no measured score", async () => {
  const fetch = stubServer((ids) =>
    new Response(
      JSON.stringify(ids.map((id) => ({
        id, run_id: "run-1", measured: null,
        ...(id === "BRD-K10706131"
          ? { estimate: -0.18, basis: "new_structure", status: "computed" }
          : { estimate: null, basis: null, status: "no_structure" }),
      }))),
      { status: 200 },
    ),
  );
  setup();
  check("donepezil, galantamine, rivastigmine, lithium");
  await screen.findByRole("columnheader", { name: "AI estimate" });
  const riva = within(rowFor("rivastigmine"));
  expect(riva.getByText("new structure")).toBeTruthy();
  expect(riva.getByLabelText("AI estimate -0.18")).toBeTruthy();
  expect(riva.queryByText("measured")).toBeNull();
  expect(within(rowFor("donepezil")).getByText("no structure")).toBeTruthy();
  const call = fetch.mock.calls.find(([url]) => url === "/api/compounds/estimate");
  // Only LINCS ids are sent, each once; names without a match are not.
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ ids: ["BRD-A49160188", "BRD-A49148672", "BRD-K10706131"] });
});

it("leaves the column out quietly when the model is not trained (409)", async () => {
  const fetch = stubServer(() => new Response("{}", { status: 409 }));
  setup();
  check("donepezil, galantamine, rivastigmine, lithium");
  await screen.findByText("684 / 1,816");
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === "/api/compounds/estimate")).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("columnheader", { name: "AI estimate" })).toBeNull();
  expect(screen.queryByText(/Estimated from structure/)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("explains the estimate plainly, with the honest test numbers", () => {
  for (const label of ["AI estimate", "held out", "in training", "new structure"]) {
    const tip = badgeTip(label) ?? "";
    expect(tip, label).toMatch(/random forest/);
    expect(tip, label).toMatch(/barely better than guessing the average/);
    expect(tip, label).toMatch(/0\.47.*0\.48.*rank correlation 0\.18/);
    expect(tip, label).toMatch(/Never used for ranking or for any hidden test/);
    expect(tip, label).not.toMatch(/[–—]/);
  }
  expect(badgeTip("in training")).toMatch(/saw this compound.*looks better than it really is/);
  expect(badgeTip("AI estimate")).toMatch(/"In training data" means the model saw this compound while training/);
});

it("ships the same mock values as the contract fixture", () => {
  const contract = JSON.parse(
    readFileSync(resolve(process.cwd(), "../../contracts/fixtures/estimateCompounds.json"), "utf8"),
  );
  expect(fixture).toEqual(contract);
});
