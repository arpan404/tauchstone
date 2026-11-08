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
import { mockCompoundSearch, mockLookup } from "@/api/mvpHooks";
import { useUi } from "@/store/ui";
import { CompoundsView } from "./CompoundsView";
HTMLElement.prototype.scrollIntoView = vi.fn();
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubEnv("VITE_USE_MOCK", "1");
  useUi.setState({ step: "candidates", selectedCandidateId: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function rowFor(query: string): HTMLElement {
  const table = screen.getByRole("table", { name: "Compound results" });
  const row = within(table)
    .getAllByRole("row")
    .find((r) => r.querySelector("td")?.textContent === query);
  if (!row) throw new Error(`no row for ${query}`);
  return row;
}
async function findRowFor(query: string) {
  let row: HTMLElement | undefined;
  await waitFor(() => {
    row = rowFor(query);
  });
  return row!;
}
function field() {
  return screen.getByLabelText("Compound names") as HTMLInputElement;
}
function chips() {
  return screen
    .queryAllByRole("button", { name: /^Remove / })
    .map((b) => b.getAttribute("aria-label")!.replace(/^Remove /, ""));
}
function paste(text: string) {
  fireEvent.paste(field(), { clipboardData: { getData: () => text } });
}
/** Replace the default chips with a pasted list. */
function pasteOnly(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  paste(text);
}
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
  pasteOnly("donepezil, memantine\ngalantamine, rivastigmine, nepafenac, lithium");
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  for (const rank of [
    "684 / 1,816",
    "502 / 1,816",
    "1,214 / 1,816",
    "2 / 1,816",
  ])
    expect(await screen.findByText(rank)).toBeTruthy();
  // Also shown as the measured score beside the AI estimate.
  expect(screen.getAllByText("+0.21").length).toBeGreaterThan(0);
  expect(within(rowFor("rivastigmine")).getByText("not rankable")).toBeTruthy();
  expect(within(rowFor("lithium")).getByText("not in LINCS")).toBeTruthy();
  for (const q of ["rivastigmine", "lithium"])
    expect(within(rowFor(q)).queryAllByRole("button")).toHaveLength(0);
  expect(within(rowFor("donepezil")).getByText("ranked")).toBeTruthy();
  fireEvent.click(
    within(rowFor("nepafenac")).getByRole("button", { name: "Attack" }),
  );
  expect(useUi.getState().selectedCandidateId).toBe("MOCK-0002");
  expect(useUi.getState().step).toBe("attack");
  expect(
    within(rowFor("donepezil")).getByRole("button", { name: "Build hidden tests" }),
  ).toBeTruthy();
});
it("shows an empty state before the first check and opens a ranked drug", async () => {
  setup();
  expect(screen.getByText("No compounds checked")).toBeTruthy();
  expect(screen.getByText("not preregistered")).toBeTruthy();
  expect(chips()).toEqual(["donepezil", "memantine", "galantamine", "rivastigmine", "nepafenac"]);
  expect(screen.getByText("5 names")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  await screen.findByRole("table", { name: "Compound results" });
  fireEvent.click(
    within(await findRowFor("nepafenac")).getByRole("button", {
      name: "Open drug Nepafenac",
    }),
  );
  expect(useUi.getState().selectedCandidateId).toBe("MOCK-0002");
  expect(useUi.getState().step).toBe("evidence");
});
it("posts pasted chip names in order, once each, with project scope and clears stale results after editing", async () => {
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
  pasteOnly(" donepezil,\n\n memantine, Donepezil ");
  expect(chips()).toEqual(["donepezil", "memantine"]);
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/lookup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          names: ["donepezil", "memantine"],
          project_id: "project-1",
        }),
      }),
    ),
  );
  await screen.findByText("502 / 1,816");
  fireEvent.click(screen.getByRole("button", { name: "Remove memantine" }));
  expect(screen.queryByText("502 / 1,816")).toBeNull();
});

it("labels names the lookup cannot resolve apart from compounds missing from LINCS", async () => {
  vi.stubEnv("VITE_USE_MOCK", "0");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [
        { query: "Aricept", status: "ranked", drug_id: "BRD-A49160188", name: "Donepezil", pool_rank: 684,
          rank_total: 1816, consensus: -0.24, n_contexts: 6, attack_ready: false, preregistered: false },
        { query: "lithium", status: "not_in_lincs", attack_ready: false, preregistered: false },
        { query: "zzqx", status: "unrecognized", attack_ready: false, preregistered: false },
      ],
    })),
  );
  setup();
  pasteOnly("Aricept, lithium, zzqx");
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  const unknown = await findRowFor("zzqx");
  expect(within(unknown).getByText("name not recognised")).toBeTruthy();
  expect(within(rowFor("lithium")).getByText("not in LINCS")).toBeTruthy();
  expect(within(rowFor("Aricept")).getByText("684 / 1,816")).toBeTruthy();
  expect(within(unknown).queryAllByRole("button")).toHaveLength(0);
});

it("typing searches, Enter adds the best match as a chip, Backspace on empty removes the last chip", async () => {
  setup();
  const input = field();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "ticry" } });
  const option = await screen.findByRole("option", { name: /Ticrynafen/ });
  expect(within(option).getByText("#1")).toBeTruthy();
  expect(within(option).getByText("-2.32")).toBeTruthy();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(chips().at(-1)).toBe("Ticrynafen");
  expect(input.value).toBe("");
  fireEvent.keyDown(input, { key: "Backspace" });
  expect(chips()).toEqual(["donepezil", "memantine", "galantamine", "rivastigmine", "nepafenac"]);
  fireEvent.click(screen.getByRole("button", { name: "Remove galantamine" }));
  expect(chips()).toEqual(["donepezil", "memantine", "rivastigmine", "nepafenac"]);
});

it("shows brand matches with their status and keeps unmatched free text as a chip", async () => {
  setup();
  const input = field();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "aricept" } });
  const brand = await screen.findByRole("option", { name: /Donepezil/ });
  expect(within(brand).getByText("Aricept")).toBeTruthy();
  expect(within(brand).getByText("#684")).toBeTruthy();
  // Donepezil is already a chip (checked): picking it again keeps one chip.
  expect(brand.getAttribute("data-checked")).toBe("true");
  fireEvent.click(brand);
  expect(chips().filter((c) => c.toLowerCase() === "donepezil")).toHaveLength(1);
  expect(input.value).toBe("");
  fireEvent.change(input, { target: { value: "rivas" } });
  expect(await screen.findByText("not rankable")).toBeTruthy();
  fireEvent.change(input, { target: { value: "zzqx" } });
  await screen.findByText("No match");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(chips().at(-1)).toBe("zzqx");
  // A typed comma commits the name before it.
  fireEvent.change(input, { target: { value: "Exelon, lith" } });
  expect(chips().at(-1)).toBe("Exelon");
  expect(input.value).toBe("lith");
});

it("searches GET /compounds/search and checks the chip names with POST /lookup", async () => {
  vi.stubEnv("VITE_USE_MOCK", "0");
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, "http://x");
    const body =
      u.pathname === "/api/compounds/search"
        ? mockCompoundSearch(u.searchParams.get("q") ?? "", Number(u.searchParams.get("limit")))
        : u.pathname === "/api/lookup"
          ? mockLookup(JSON.parse(String(init?.body)))
          : { mock: false };
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fetch);
  setup();
  const input = field();
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("button", { name: "Remove nepafenac" }));
  fireEvent.change(input, { target: { value: "Nepa" } });
  await screen.findByRole("option", { name: /Nepafenac/ });
  expect(fetch).toHaveBeenCalledWith("/api/compounds/search?q=Nepa&limit=20", expect.anything());
  fireEvent.change(input, { target: { value: "Ticrynafen" } });
  fireEvent.click(await screen.findByRole("option", { name: /Ticrynafen/ }));
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/lookup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          names: ["donepezil", "memantine", "galantamine", "rivastigmine", "Ticrynafen"],
          project_id: "project-1",
        }),
      }),
    ),
  );
  expect(await screen.findByText("1 / 1,816")).toBeTruthy();
});
