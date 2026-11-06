import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
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
  fireEvent.click(screen.getByLabelText("Negative consensus only"));
  expect(screen.queryByRole("button", { name: /Select Beta/ })).toBeNull();
  fireEvent.click(screen.getByText("Experiments"));
  expect(useUi.getState().step).toBe("attack");
});

it("keeps a later-row selection visible in the inspector through search and sorting", () => {
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
  fireEvent.change(screen.getByLabelText("Sort"), {
    target: { value: "contexts" },
  });
  expect(within(results).getAllByRole("button")[0].textContent).toContain(
    "Beta",
  );
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
  fireEvent.click(screen.getByRole("button", { name: "Remove Alpha", exact: true }));
  expect(screen.getByRole("button", { name: "Add to comparison" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Add to comparison" }));
  const comparison = screen.getByRole("region", { name: "Candidate comparison" });
  expect(within(comparison).getByText("Candidate 4")).toBeTruthy();
  expect(within(comparison).queryByText("Alpha")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear comparison" }));
  expect(screen.queryByRole("region", { name: "Candidate comparison" })).toBeNull();
});
