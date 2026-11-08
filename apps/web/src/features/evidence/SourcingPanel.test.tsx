import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Schema } from "@/api/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SOURCING_SOURCE, SourcingPanel } from "./SourcingPanel";

afterEach(cleanup);

const base: Schema<"Sourcing"> = {
  status: "at_or_above_95",
  threshold_pct: 95,
  best_purity_pct: 99.37,
  n_samples: 1,
  n_samples_at_or_above_95: 1,
  n_vendors: 1,
  vendors: ["Sigma"],
  best_vendor: "Sigma",
  best_catalog_no: "MFCD00867339",
  qc_incompatible: false,
  n_qc_incompatible: 0,
  match: "inchikey",
  source: SOURCING_SOURCE,
  note: "",
};

function setup(sourcing: Schema<"Sourcing"> | undefined) {
  render(
    <TooltipProvider>
      <SourcingPanel sourcing={sourcing} />
    </TooltipProvider>,
  );
  return screen.getByRole("region", { name: "Before the lab: purity and sourcing" });
}

function value(panel: HTMLElement, label: string) {
  return within(panel).getByText(label).closest("dt")?.nextElementSibling?.textContent;
}

it("states a 95%+ sample in words, with purity, vendors and the source", () => {
  const panel = setup(base);
  expect(within(panel).getByText("A vendor sample with purity of 95% or more is on record.")).toBeTruthy();
  expect(within(panel).getByText("95% or more on record")).toBeTruthy();
  expect(within(panel).getByText(SOURCING_SOURCE)).toBeTruthy();
  expect(value(panel, "Best recorded purity")).toBe("99.37%");
  expect(value(panel, "Vendor")).toBe("Sigma");
  expect(value(panel, "Best sample")).toBe("Sigmacatalog MFCD00867339");
});

it("explains the 2020 measurement and the lab re-check on hover", async () => {
  const panel = setup(base);
  fireEvent.focus(within(panel).getByText("95% or more on record"));
  fireEvent.pointerEnter(within(panel).getByText("95% or more on record"));
  expect(
    await screen.findByText(/vendor samples bought around 2020\. Any lab must re-check the purity of its own sample/),
  ).toBeTruthy();
});

it("names below-95, salt-form matches and QC-incompatible samples", () => {
  const panel = setup({
    ...base,
    status: "below_95",
    best_purity_pct: 89.78,
    n_samples: 3,
    n_samples_at_or_above_95: 0,
    n_vendors: 2,
    vendors: ["Selleck", "Tocris"],
    match: "inchikey_block",
    qc_incompatible: true,
    n_qc_incompatible: 1,
  });
  expect(within(panel).getByText("below 95% only")).toBeTruthy();
  expect(within(panel).getByText(/none reached 95% purity/)).toBeTruthy();
  expect(within(panel).getByText(/different salt or stereo form/)).toBeTruthy();
  expect(within(panel).getByText(/1 sample could not be checked/)).toBeTruthy();
  expect(value(panel, "Vendors (2)")).toBe("Selleck, Tocris");
  expect(value(panel, "Best recorded purity")).toBe("89.78%");
});

it("says plainly when there is no record, and when the table is missing", () => {
  const panel = setup({ ...base, status: "no_record", match: "none", n_samples: 0, n_vendors: 0, vendors: [] });
  expect(within(panel).getByText("no record")).toBeTruthy();
  expect(within(panel).getByText(/No vendor sample of this compound is on record/)).toBeTruthy();
  expect(within(panel).queryByText("Best recorded purity")).toBeNull();
  cleanup();
  const empty = setup(undefined);
  expect(within(empty).getByText("Purity record not available in this build")).toBeTruthy();
});

