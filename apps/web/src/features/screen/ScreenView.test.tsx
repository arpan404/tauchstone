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
    ],
  }),
  useCreateProject: () => ({ mutateAsync: create }),
  startScreen: start,
  watchScreen: watch,
  workspaceMock: () => false,
}));
beforeEach(() => {
  useUi.setState({ currentProjectId: "frozen" });
  watch.mockReset().mockReturnValue(() => {});
  create.mockReset().mockResolvedValue({ id: "separate" });
  start
    .mockReset()
    .mockResolvedValue({
      id: "job",
      status: "queued",
      n_signatures: 113310,
      n_scored: 0,
      elapsed_s: 0,
    });
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
it("creates a separate project for the held-out cohort", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: /GSE173955/ }));
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith("separate", "GSE173955", null),
  );
  expect(create).toHaveBeenCalledWith({
    name: "GSE173955",
    signature_id: "GSE173955",
  });
  expect(useUi.getState().currentProjectId).toBe("separate");
});
it("creates a separate upload project instead of replacing the frozen cohort", async () => {
  open();
  const file = new File(["gene,log2fc,stat,fdr"], "custom.csv", {
    type: "text/csv",
  });
  fireEvent.change(screen.getByLabelText("Upload signature CSV"), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run screen" }));
  await waitFor(() =>
    expect(start).toHaveBeenCalledWith("separate", "GSE132903", file),
  );
  expect(create).toHaveBeenCalledWith({ name: "custom", signature_id: null });
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
