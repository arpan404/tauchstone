import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectsView } from "./ProjectsView";
import { useUi } from "@/store/ui";

const { mutate, remove, extra } = vi.hoisted(() => ({
  mutate: vi.fn(),
  remove: vi.fn(),
  extra: [] as Record<string, unknown>[],
}));
vi.mock("@/api/workspace", () => ({
  useProjects: () => ({
    isPending: false,
    data: [
      {
        id: "GSE132903",
        name: "Alzheimer's · middle temporal gyrus",
        kind: "builtin",
        signature_id: "GSE132903",
        n_ranked: 1816,
        n_attack_ready: 100,
        last_screen_id: "frozen-GSE132903",
        preregistered: true,
      },
      {
        id: "GSE173955",
        name: "Alzheimer's · hippocampus",
        kind: "builtin",
        signature_id: "GSE173955",
        preregistered: false,
      },
      ...extra,
    ],
  }),
  useCreateProject: () => ({ mutate, isPending: false, error: null }),
  useDeleteProject: () => ({ mutate: remove, reset: vi.fn(), isPending: false, error: null }),
  workspaceMock: () => false,
}));
beforeEach(() => {
  mutate.mockReset();
  remove.mockReset();
  extra.length = 0;
  useUi.setState({ currentProjectId: "GSE132903", step: "projects" });
});
afterEach(cleanup);

it("lists projects with ranked counts and preregistration labels", () => {
  render(<ProjectsView />);
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText("1,816")).toBeTruthy();
  expect(within(rows[1]).getByText("preregistered")).toBeTruthy();
  expect(within(rows[1]).queryByText("Exploratory")).toBeNull();
  expect(within(rows[2]).getByText("Exploratory")).toBeTruthy();
  expect(within(rows[2]).getByText("not screened")).toBeTruthy();
});

it("opens a screened project on candidates and an unscreened one on screen", () => {
  render(<ProjectsView />);
  fireEvent.click(screen.getByRole("button", { name: /middle temporal gyrus/ }));
  expect(useUi.getState().step).toBe("candidates");
  fireEvent.click(screen.getByRole("button", { name: /hippocampus/ }));
  expect(useUi.getState().currentProjectId).toBe("GSE173955");
  expect(useUi.getState().step).toBe("screen");
});

it("creates a new project, labelled not preregistered", () => {
  render(<ProjectsView />);
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Exploratory")).toBeTruthy();
  fireEvent.change(within(dialog).getByRole("textbox"), {
    target: { value: "My cohort" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /^Upload CSV/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Choose CSV" }));
  // The server creates an upload project only after its CSV validates.
  expect(mutate).not.toHaveBeenCalled();
  expect(useUi.getState().uploadName).toBe("My cohort");
  expect(useUi.getState().step).toBe("screen");
});

it("opens the existing built-in project instead of creating a duplicate", () => {
  useUi.setState({ currentProjectId: "GSE132903" });
  render(<ProjectsView />);
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /^GSE173955/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Open project" }));
  expect(mutate).not.toHaveBeenCalled();
  expect(useUi.getState().currentProjectId).toBe("GSE173955");
  expect(useUi.getState().step).toBe("screen");
});

it("deletes upload projects only, after confirmation", () => {
  render(<ProjectsView />);
  expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  cleanup();
  extra.push({ id: "up1", name: "My upload", kind: "upload", signature_id: null,
    n_ranked: 1816, last_screen_id: "abc", preregistered: false });
  render(<ProjectsView />);
  fireEvent.click(screen.getByRole("button", { name: "Delete My upload" }));
  expect(remove).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));
  expect(remove).toHaveBeenCalledWith("up1", expect.anything());
});

it("labels the frozen run and clears selections when the project changes", () => {
  useUi.setState({ selectedCandidateId: "d1", compareIds: ["d1"], sessionId: "s" });
  render(<ProjectsView />);
  expect(screen.getByText("original run")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /middle temporal gyrus/ }));
  expect(useUi.getState().selectedCandidateId).toBe("d1");
  fireEvent.click(screen.getByRole("button", { name: /hippocampus/ }));
  const state = useUi.getState();
  expect([state.selectedCandidateId, state.compareIds, state.sessionId]).toEqual([null, [], null]);
});
