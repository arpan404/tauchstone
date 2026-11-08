import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScreenView } from "./ScreenView";
import { useUi } from "@/store/ui";
const { start, create, watch } = vi.hoisted(() => ({
  start: vi.fn(),
  create: vi.fn(),
  watch: vi.fn(),
}));
vi.mock("@/api/workspace", () => ({
  useProjects: () => ({
    data: [
      {
        id: "frozen",
        kind: "builtin",
        signature_id: "GSE132903",
        preregistered: true,
      },
      {
        id: "hippo",
        kind: "builtin",
        signature_id: "GSE173955",
        preregistered: false,
      },
    ],
  }),
  useCreateProject: () => ({ mutateAsync: create }),
  startScreen: start,
  TEMPLATE_CSV_URL: "/api/screens/template.csv",
  watchScreen: watch,
  workspaceMock: () => false,
}));
beforeEach(() => {
  useUi.setState({ currentProjectId: "frozen", uploadName: null });
  watch.mockReset().mockReturnValue(() => {});
  create.mockReset().mockResolvedValue({ id: "separate" });
  start
    .mockReset()
    .mockImplementation(async (projectId: string) => ({
      id: "job",
      project_id: projectId === "frozen" ? "frozen" : projectId,
      status: "queued",
      n_signatures: 113310,
      n_scored: 0,
      elapsed_s: 0,
    }));
});
afterEach(cleanup);
function open() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ScreenView />
    </QueryClientProvider>,
  );
}
it("starts the frozen signature in its existing project", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith("frozen", "GSE132903", null),
  );
  expect(create).not.toHaveBeenCalled();
});
it("screens the held-out cohort in its own built-in project, never a duplicate", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: /GSE173955/ }));
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith("hippo", "GSE173955", null),
  );
  expect(create).not.toHaveBeenCalled();
  expect(useUi.getState().currentProjectId).toBe("hippo");
});
it("sends an upload with a name so the server creates the project after validation", async () => {
  start.mockImplementation(async () => ({ id: "job", project_id: "new-upload", status: "queued",
    n_signatures: 113310, n_scored: 0, elapsed_s: 0 }));
  useUi.setState({ uploadName: "My cohort" });
  open();
  const file = new File(["gene,log2fc,stat,fdr"], "custom.csv", {
    type: "text/csv",
  });
  fireEvent.change(screen.getByLabelText("Upload signature CSV"), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith("frozen", "GSE132903", file, { name: "My cohort" }),
  );
  expect(create).not.toHaveBeenCalled();
  expect(useUi.getState().currentProjectId).toBe("new-upload");
  expect(useUi.getState().uploadName).toBeNull();
});
it("shows the server's error detail for a rejected upload", async () => {
  start.mockRejectedValue(new Error("Only 7 landmark genes mapped; at least 50 required"));
  open();
  const file = new File(["gene,log2fc,stat,fdr"], "bad.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Upload signature CSV"), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Only 7 landmark genes mapped; at least 50 required",
  );
  expect(useUi.getState().currentProjectId).toBe("frozen");
});
it("offers a template and flags the weak held-out signature", () => {
  open();
  expect(
    screen.getByRole("link", { name: /Download template/ }).getAttribute("href"),
  ).toBe("/api/screens/template.csv");
  expect(screen.getByText(/0 genes at FDR < 0.05 after normalisation/)).toBeTruthy();
});
it("keeps the ranked count provisional until the screen is done", async () => {
  watch.mockImplementation((job, onEvent) => {
    onEvent({ ...job, status: "scoring", n_scored: 5000, n_ranked: 0 });
    return () => {};
  });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  expect(await screen.findByText("pending")).toBeTruthy();
});
it("labels anything but the frozen signature not preregistered", () => {
  open();
  expect(screen.queryByText("not preregistered")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /GSE173955/ }));
  expect(screen.getByText("not preregistered")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^GSE132903/ }));
  expect(screen.queryByText("not preregistered")).toBeNull();
});
it("streams hits and opens the drug view from a hit", async () => {
  watch.mockImplementation((job, onEvent) => {
    onEvent({
      ...job,
      status: "done",
      n_scored: 113310,
      elapsed_s: 6.2,
      n_ranked: 1816,
      top: [{ rank: 1, name: "Ticrynafen", drug_id: "d1", consensus: -2.3 }],
    });
    return () => {};
  });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  const hit = await screen.findByRole("button", { name: /Ticrynafen/ });
  expect(hit.classList.contains("mvp-hit")).toBe(true);
  expect(screen.getByRole("button", { name: "Open candidates" })).toBeTruthy();
  fireEvent.click(hit);
  expect(useUi.getState().selectedCandidateId).toBe("d1");
  expect(useUi.getState().step).toBe("evidence");
});
