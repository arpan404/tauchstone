import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { useUi } from "@/store/ui";
vi.mock("@/api/hooks", () => ({
  useCandidates: () => ({
    data: {
      candidates: [
        {
          id: "BRD-1",
          name: "Alpha",
          rank: 1,
          consensus: -1,
          consensus_iqr: [-2, 0],
          scores: { wtcs: -1, ks: -1, cosine: -1 },
          n_ranking_contexts: 2,
        },
        {
          id: "BRD-2",
          name: "Beta",
          rank: 2,
          consensus: 1,
          consensus_iqr: [0, 2],
          scores: { wtcs: 1, ks: 1, cosine: 1 },
          n_ranking_contexts: 4,
        },
        ...Array.from({ length: 48 }, (_, i) => ({
          id: `BRD-${i + 3}`,
          name: `Candidate ${i + 3}`,
          rank: i + 3,
          consensus: -0.1,
          consensus_iqr: [-1, 0],
          scores: { wtcs: -0.1, ks: -0.1, cosine: -0.1 },
          n_ranking_contexts: 1,
        })),
      ],
      n_ranked: 2,
      signature: "test",
    },
  }),
  useMockStatus: () => false,
}));
vi.mock("@/components/ProvenanceStrip", () => ({
  ProvenanceStrip: () => null,
}));
import { RepurposingView } from "./RepurposingView";
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  cleanup();
  useUi.setState({ selectedCandidateId: null, step: "candidates" });
});
it("searches IDs, clears filters, and keeps selection on page until an explicit action", () => {
  useUi.setState({ step: "candidates" });
  render(<RepurposingView />);
  fireEvent.change(screen.getByLabelText("Search name or ID"), {
    target: { value: "brd-2" },
  });
  expect(screen.queryByRole("button", { name: /Select Alpha/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Select Beta/ }));
  expect(useUi.getState().step).toBe("candidates");
  fireEvent.click(screen.getByText("Add to comparison"));
  expect(screen.getByText("Discovery comparison (1/3)")).toBeTruthy();
  fireEvent.click(screen.getByText("Clear controls"));
  expect(screen.getByRole("button", { name: /Select Alpha/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Negative consensus only" }));
  expect(screen.queryByRole("button", { name: /Select Beta/ })).toBeNull();
  fireEvent.click(screen.getByText("Experiments"));
  expect(useUi.getState().step).toBe("attack");
});

it("keeps a later-row selection visible in the inspector through search and sorting", async () => {
  useUi.setState({ step: "candidates" });
  render(<RepurposingView />);
  const results = screen.getByRole("region", { name: "Candidate results" });
  fireEvent.click(
    within(results).getByRole("button", { name: /Select Candidate 50,/ }),
  );
  const inspector = screen.getByRole("region", { name: "Candidate inspector" });
  expect(within(inspector).getByText("Candidate 50")).toBeTruthy();
  expect(useUi.getState().step).toBe("candidates");
  expect(useUi.getState().selectedCandidateId).toBe("BRD-50");
  fireEvent.click(screen.getByRole("combobox", { name: "Sort" }));
  fireEvent.pointerDown(await screen.findByRole("option", { name: "Ranking contexts descending" }), {pointerType: "mouse"});
  fireEvent.click(await screen.findByRole("option", { name: "Ranking contexts descending" }), {detail: 1});
  await waitFor(() => expect(within(results).getAllByRole("button")[0].textContent).toContain("Beta"));
  fireEvent.change(screen.getByLabelText("Search name or ID"), {
    target: { value: "Alpha" },
  });
  expect(within(inspector).getByText("Candidate 50")).toBeTruthy();
  expect(useUi.getState().selectedCandidateId).toBe("BRD-50");
});

it("limits comparison to three candidates and frees a slot when one is removed", () => {
  render(<RepurposingView />);
  expect(screen.queryByRole("region", { name: "Candidate comparison" })).toBeNull();
  for (const name of ["Alpha", "Beta", "Candidate 3"]) {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Select ${name},`) }));
    fireEvent.click(screen.getByRole("button", { name: "Add to comparison" }));
  }
  fireEvent.click(screen.getByRole("button", { name: /Select Candidate 4,/ }));
  expect(screen.getByRole("button", { name: "Add to comparison" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Remove Alpha" }));
  expect(screen.getByRole("button", { name: "Add to comparison" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Add to comparison" }));
  const comparison = screen.getByRole("region", { name: "Candidate comparison" });
  expect(within(comparison).getByText("Candidate 4")).toBeTruthy();
  expect(within(comparison).queryByText("Alpha")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear comparison" }));
  expect(screen.queryByRole("region", { name: "Candidate comparison" })).toBeNull();
});

it("shows all discovery metrics and opens evidence only on the explicit action", () => {
  render(<RepurposingView />);
  fireEvent.click(screen.getByRole("button", { name: /Select Alpha,/ }));
  const inspector = screen.getByRole("region", { name: "Candidate inspector" });
  expect(within(inspector).getByRole("button", {name: "Discovery metrics"}).getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(within(inspector).getByRole("button", {name: "Discovery metrics"}));
  for (const metric of ["Discovery rank", "Consensus", "IQR", "Ranking contexts", "WTCS", "KS", "Cosine", "Approval"]) {
    expect(within(inspector).getByText(metric)).toBeTruthy();
  }
  expect(within(inspector).getByText("BRD-1")).toBeTruthy();
  expect(useUi.getState().step).toBe("candidates");
  fireEvent.click(within(inspector).getByRole("button", { name: "Evidence" }));
  expect(useUi.getState().step).toBe("evidence");
  expect(useUi.getState().selectedCandidateId).toBe("BRD-1");
});


it("defaults to Browse and switches to Ranking without losing the selected candidate", () => {
  render(<RepurposingView />);
  expect(screen.getByRole("tab", {name: "Browse"}).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByText("Choose a candidate to investigate")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: /Select Alpha,/}));
  fireEvent.click(screen.getByRole("tab", {name: "Ranking"}));
  expect(screen.getByRole("table")).toBeTruthy();
  expect(useUi.getState().selectedCandidateId).toBe("BRD-1");
  fireEvent.click(screen.getByRole("tab", {name: "Browse"}));
  expect(screen.queryByRole("table")).toBeNull();
});

it("restores separate candidate notes and comparison after remount", () => {
  const view = render(<RepurposingView />);
  fireEvent.click(screen.getByRole("button", {name: /Select Alpha,/}));
  fireEvent.change(screen.getByRole("textbox", {name: "Research notes"}), {target: {value: "Check Alpha context coverage"}});
  fireEvent.click(screen.getByRole("button", {name: "Add to comparison"}));
  fireEvent.click(screen.getByRole("button", {name: /Select Beta,/}));
  expect((screen.getByRole("textbox", {name: "Research notes"}) as HTMLTextAreaElement).value).toBe("");
  fireEvent.change(screen.getByRole("textbox", {name: "Research notes"}), {target: {value: "Question for Beta"}});
  view.unmount();
  render(<RepurposingView />);
  expect((screen.getByRole("textbox", {name: "Research notes"}) as HTMLTextAreaElement).value).toBe("Question for Beta");
  fireEvent.click(screen.getByRole("button", {name: /Select Alpha,/}));
  expect((screen.getByRole("textbox", {name: "Research notes"}) as HTMLTextAreaElement).value).toBe("Check Alpha context coverage");
  expect(screen.getByText("Saved on this device")).toBeTruthy();
  expect(within(screen.getByRole("region", {name: "Candidate comparison"})).getByText("Alpha")).toBeTruthy();
});
