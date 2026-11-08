import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Screen } from "@/api/workspace";
import { CellLinePanel } from "./CellLinePanel";
import { type CellLineCard, compositionSentence } from "./cellLineCards";

let cards: CellLineCard[] = [];
beforeEach(() => {
  cards = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ cell_lines: cards, provenance: {} }))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const card = (over: Partial<CellLineCard>): CellLineCard => ({
  cell_id: "MCF7",
  display_name: "MCF-7",
  cellosaurus_id: "CVCL_0031",
  organ: "breast",
  sampled_from: "pleural effusion (metastasis)",
  disease: "Invasive breast carcinoma of no special type",
  description: "unspecified",
  category: "cancer",
  sex: "female",
  age: "69 years",
  neural: false,
  summary: "Breast cancer cells, from a 69-year-old woman.",
  source: "Cellosaurus CVCL_0031",
  licence: "Cellosaurus data CC BY 4.0",
  source_url: "https://www.cellosaurus.org/CVCL_0031",
  image: {
    url: "/cell-lines/MCF7/image",
    caption: "MCF-7 cells. Green: TUBB; red: microtubules; blue: nucleus.",
    credit: "Image: Human Protein Atlas",
    licence: "CC BY 4.0",
    page_url: "https://v25.proteinatlas.org/x",
    gene: "TUBB",
  },
  ...over,
});

const job = (cell_lines: Screen["cell_lines"]): Screen => ({
  id: "s",
  project_id: "p",
  status: "scoring",
  n_signatures: 113310,
  n_scored: 30000,
  elapsed_s: 2,
  preregistered: false,
  cell_lines,
  n_cell_lines: 40,
});

it("shows a quiet empty state before any screen", () => {
  render(<CellLinePanel job={null} running={false} />);
  expect(screen.getByText("Cell lines being scored")).toBeTruthy();
  expect(screen.getByText(/Run a screen to see each LINCS cell line/)).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByText("Illustration")).toBeNull();
});

it("renders one tile per API cell line in API order with neural marker", () => {
  render(
    <CellLinePanel
      running
      job={job([
        { cell_id: "MCF7", n_scored: 1200, best_consensus: -3.21, neural: false },
        { cell_id: "NPC", n_scored: 300, best_consensus: -1.5, neural: true },
        { cell_id: "ASC", n_scored: 20, best_consensus: null, neural: false },
      ])}
    />,
  );
  const items = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(items.map((li) => li.textContent?.match(/^[A-Z0-9.]+/)?.[0])).toEqual([
    "MCF7",
    "NPC",
    "ASC",
  ]);
  expect(items[0].textContent).toContain("-3.21");
  expect(items[1].textContent).toContain("neural");
  expect(items[2].textContent).toContain("not available");
  expect(screen.getByText("Top 3 of 40 lines by signatures scored")).toBeTruthy();
  expect(screen.getByText("1 neural")).toBeTruthy();
});

it("shows the project's last saved run after a reload, labelled as such", () => {
  const saved = { ...job([{ cell_id: "VCAP", n_scored: 11966, best_consensus: -3.3, neural: false }]), status: "done" as const };
  render(<CellLinePanel job={saved} running={false} fromSaved />);
  expect(screen.getByText(/^Last run: top 1 of 40 lines/)).toBeTruthy();
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
});

it("says a finished run saved without cell lines needs a re-run", () => {
  render(<CellLinePanel job={{ ...job([]), status: "done" }} running={false} fromSaved />);
  expect(screen.getByText("Not recorded for this run")).toBeTruthy();
  expect(screen.getByText(/Run the screen again to see them/)).toBeTruthy();
});

it("opens a cited cell-line card from a tile, with photo only when there is one", async () => {
  cards = [
    card({}),
    card({ cell_id: "NEU", display_name: "NEU", cellosaurus_id: "unspecified", category: "stem-cell derived",
      neural: true, image: null, summary: "Neurons grown from the NPC-8330-8 stem-cell derived neural progenitors.",
      source_url: "unspecified" }),
  ];
  render(
    <CellLinePanel
      running={false}
      job={{ ...job([
        { cell_id: "MCF7", n_scored: 900, best_consensus: -3.2, neural: false },
        { cell_id: "NEU", n_scored: 100, best_consensus: -1.1, neural: true },
      ]), status: "done" }}
    />,
  );
  expect(await screen.findByText(/Most of these measurements come from cancer cell lines \(90% of signatures\); 1 of 2 lines is neural\./)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Facts about MCF-7/ }));
  expect(await screen.findByText("Breast cancer cells, from a 69-year-old woman.")).toBeTruthy();
  expect(screen.getByRole("img").getAttribute("src")).toBe("/api/cell-lines/MCF7/image");
  expect(screen.getByText(/Image: Human Protein Atlas, CC BY 4.0/)).toBeTruthy();
  expect(screen.getByText(/Cellosaurus CVCL_0031/)).toBeTruthy();
  cleanup();
});

it("builds the composition sentence from real counts only", () => {
  const m = new Map([["A", card({ cell_id: "A" })], ["B", card({ cell_id: "B", category: "normal" })]]);
  expect(compositionSentence([{ cell_id: "A", n_scored: 1 }, { cell_id: "B", n_scored: 3, neural: true }], m))
    .toBe("25% of these signatures come from cancer cell lines; 1 of 2 lines is neural.");
  expect(compositionSentence([{ cell_id: "A", n_scored: 1 }], new Map())).toBeNull();
});
