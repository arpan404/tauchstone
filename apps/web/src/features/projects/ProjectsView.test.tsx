import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectsView } from "./ProjectsView";
import { useUi } from "@/store/ui";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
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
        last_screen_id: "25785e7b-29fc-4bbd",
        preregistered: true,
      },
      {
        id: "GSE173955",
        name: "Alzheimer's · hippocampus",
        kind: "builtin",
        signature_id: "GSE173955",
        preregistered: false,
      },
    ],
  }),
  useCreateProject: () => ({ mutate, isPending: false, error: null }),
  workspaceMock: () => false,
}));
beforeEach(() => {
  mutate.mockReset();
  useUi.setState({ currentProjectId: "GSE132903", step: "projects" });
});
afterEach(cleanup);

it("lists projects with ranked counts and preregistration labels", () => {
  render(<ProjectsView />);
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText("1,816")).toBeTruthy();
  expect(within(rows[1]).getByText("preregistered")).toBeTruthy();
  expect(within(rows[1]).queryByText("not preregistered")).toBeNull();
  expect(within(rows[2]).getByText("not preregistered")).toBeTruthy();
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
  expect(within(dialog).getByText("not preregistered")).toBeTruthy();
  fireEvent.change(within(dialog).getByRole("textbox"), {
    target: { value: "My cohort" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: /^Upload CSV/ }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  expect(mutate).toHaveBeenCalledWith(
    { name: "My cohort", signature_id: null },
    expect.anything(),
  );
});
