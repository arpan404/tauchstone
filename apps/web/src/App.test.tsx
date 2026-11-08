import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useUi } from "./store/ui";
vi.mock("@/api/hooks", () => ({
  useMockStatus: () => true,
  useHealth: () => ({ data: { status: "ok", mock: true } }),
  useCandidates: () => ({
    data: { candidates: [{ id: "compound-a", name: "Compound A", rank: 1 }] },
  }),
}));
vi.mock("@/features/repurposing/RepurposingView", () => ({
  RepurposingView: () => <div>Candidate explorer</div>,
}));
vi.mock("@/features/disease-signature/DiseaseSignatureView", () => ({
  DiseaseSignatureView: () => <div>Signature view</div>,
}));
vi.mock("@/features/evidence/EvidenceView", () => ({
  EvidenceView: () => <div>Evidence view</div>,
}));
vi.mock("@/features/tauchstone/AttackView", () => ({
  AttackView: () => <div>Experiment view</div>,
}));
vi.mock("@/features/benchmark/BenchmarkView", () => ({
  BenchmarkView: () => <div>Benchmark view</div>,
}));
vi.mock("@/features/about", () => ({ About: () => <div>Methods view</div> }));
vi.mock("@/features/single-cell", () => ({
  SingleCellPanel: () => <div>Cell view</div>,
}));

vi.mock("@/api/workspace", () => ({
  useProjects: () => ({ data: [] }),
  workspaceMock: () => true,
}));
vi.mock("@/features/projects/ProjectsView", () => ({
  ProjectsView: () => <div>Project cards</div>,
}));
vi.mock("@/features/screen/ScreenView", () => ({
  ScreenView: () => <div>Screen controls</div>,
}));
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi
    .fn()
    .mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
});
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
HTMLElement.prototype.scrollIntoView = vi.fn();
beforeEach(() => {
  localStorage.clear();
  useUi.setState({
    step: "projects",
    selectedCandidateId: null,
    currentProjectId: null,
    compareIds: [],
    sessionId: null,
  });
});
afterEach(cleanup);
describe("MVP workspace shell", () => {
  it("opens Projects with the boundary footer and nine research routes", () => {
    vi.stubEnv("VITE_EXPO", "1");
    render(<App />);
    expect(
      screen.getByRole("main", { name: "Projects" }).textContent,
    ).toContain("Project cards");
    for (const name of [
      "Projects",
      "Screen",
      "Candidates",
      "Compare",
      "Drug",
      "Attack",
      "Report",
      "My compounds",
      "Validation",
    ])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByRole("note", { name: "Boundary" }).textContent).toContain(
      "Research hypothesis only.",
    );
    expect(screen.queryByRole("button", { name: "AI lab" })).toBeNull();
  });
  it("retains selection across Drug, Attack and Projects", () => {
    useUi.getState().selectCandidate("compound-a");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Drug" }));
    expect(screen.getByRole("main", { name: "Drug" }).textContent).toContain(
      "Evidence view",
    );
    fireEvent.click(screen.getByRole("button", { name: "Attack" }));
    expect(screen.getByRole("main", { name: "Attack" }).textContent).toContain(
      "Experiment view",
    );
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(useUi.getState().selectedCandidateId).toBe("compound-a");
  });
  it("keeps a bounded compare set and project scope", () => {
    const store = useUi.getState();
    store.setProject("project-a");
    ["a", "b", "c", "d", "e"].forEach(store.toggleCompare);
    expect(useUi.getState().compareIds).toEqual(["a", "b", "c", "d"]);
    store.toggleCompare("b");
    expect(useUi.getState().compareIds).toEqual(["a", "c", "d"]);
    expect(useUi.getState().currentProjectId).toBe("project-a");
  });
  it("opens candidate search with the keyboard shortcut", async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog", {
      name: "Search workspace",
    });
    fireEvent.click(
      await within(dialog).findByRole("option", { name: /Compound A/ }),
    );
    expect(useUi.getState().selectedCandidateId).toBe("compound-a");
    expect(useUi.getState().step).toBe("evidence");
  });
});
