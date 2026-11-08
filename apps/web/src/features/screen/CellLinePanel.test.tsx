import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Screen } from "@/api/workspace";
import { CellLinePanel } from "./CellLinePanel";

afterEach(cleanup);

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
