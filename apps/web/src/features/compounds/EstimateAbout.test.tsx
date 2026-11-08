import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { EstimateAbout } from "./EstimateAbout";
import { MOCK_MODELS } from "./useEstimateModels";
import { MOCK_MODEL } from "./useStructureModel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EstimateAbout />
    </QueryClientProvider>,
  );
}
function serve(response: () => Response) {
  vi.stubEnv("VITE_USE_MOCK", "0");
  const fetch = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("is closed by default and fetches nothing until opened", () => {
  const fetch = serve(() => new Response(JSON.stringify(MOCK_MODEL)));
  setup();
  expect(screen.getByText("About this estimate")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show" }).getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Mean absolute error")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("shows status, run id, method, honest test numbers, limitations and the boundary line", async () => {
  const fetch = serve(() => new Response(JSON.stringify({ ...MOCK_MODEL, report: { ...MOCK_MODEL.report, run_id: "run-42" } })));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(await screen.findByText("run-42")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/api/lab/model", expect.anything());
  expect(screen.getByText("ready")).toBeTruthy();
  expect(screen.getByText(/random forest on 1,024-bit Morgan fingerprints/)).toBeTruthy();
  for (const value of ["0.472", "0.481", "0.023", "0.18"]) expect(screen.getByText(value)).toBeTruthy();
  expect(screen.getByText(/On 1,123 compounds whose structures were held out by scaffold group/)).toBeTruthy();
  expect(screen.getByText("Predicts discovery reversal scores, not independent biological evidence.")).toBeTruthy();
  expect(screen.getByText("It never changes the ranking, the hidden tests or any verdict.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /train/i })).toBeNull();
});

it("shows only a plain message when the model is not trained", async () => {
  serve(() => new Response(JSON.stringify({ status: "not_trained" })));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(await screen.findByText(/has not been trained on this server/)).toBeTruthy();
  expect(screen.queryByText("Mean absolute error")).toBeNull();
  expect(screen.queryByRole("button", { name: /train/i })).toBeNull();
});

it("shows only a plain message when the service is unavailable", async () => {
  serve(() => new Response("Internal Server Error: Traceback", { status: 500 }));
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(await screen.findByText(/not available right now/)).toBeTruthy();
  expect(screen.queryByText(/Traceback|500/)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("compares every model on the same held-out compounds and states which one is used", async () => {
  vi.stubEnv("VITE_USE_MOCK", "0");
  const fetch = vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/compounds/estimate/models") ? MOCK_MODELS : MOCK_MODEL)),
  );
  vi.stubGlobal("fetch", fetch);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
  expect(await screen.findByText("How it compares")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/api/compounds/estimate/models", expect.anything());
  for (const row of MOCK_MODELS.models) expect(screen.getByText(row.label)).toBeTruthy();
  expect(screen.getAllByText("in use")).toHaveLength(1);
  expect(screen.getByText(MOCK_MODELS.outcome)).toBeTruthy();
  expect(screen.getByText("current")).toBeTruthy();
  // Dashes: plain hyphens only, no en or em dashes. Clinical wording is covered repo-wide
  // by tests/redteam/test_wording.py.
  expect(document.body.textContent ?? "").not.toMatch(/[\u2013\u2014]/);
});
