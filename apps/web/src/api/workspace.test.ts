import { afterEach, describe, expect, it, vi } from "vitest";
import { startScreen, watchScreen, type Screen } from "./workspace";
const job: Screen = {
  id: "live-job",
  project_id: "p",
  signature_id: "GSE132903",
  status: "scoring",
  n_signatures: 100,
  n_scored: 10,
  elapsed_s: 1,
  preregistered: true,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("screen transport", () => {
  it("sends CSV as multipart without a JSON content type", async () => {
    vi.stubEnv("VITE_USE_MOCK", "0");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(job)));
    vi.stubGlobal("fetch", fetch);
    const file = new File(
      ["gene,log2fc,stat,fdr\n1,1,2,.01"],
      "signature.csv",
      { type: "text/csv" },
    );
    await startScreen("p", "GSE132903", file);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/screens");
    expect(init.headers).toBeUndefined();
    expect(init.body.get("project_id")).toBe("p");
    expect(init.body.get("file")).toBe(file);
  });
  it("does not replace a real API error with synthetic results", async () => {
    vi.stubEnv("VITE_USE_MOCK", "0");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ mock: false }))),
    );
    await expect(startScreen("p", "GSE132903", null)).rejects.toThrow("404");
  });
  it("streams committed progress and closes on terminal events or unmount", () => {
    const source: {
      onmessage: ((e: MessageEvent) => void) | null;
      onerror: (() => void) | null;
      close: ReturnType<typeof vi.fn>;
      addEventListener: ReturnType<typeof vi.fn>;
    } = {
      onmessage: null,
      onerror: null,
      close: vi.fn(),
      addEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "EventSource",
      class {
        constructor() {
          return source;
        }
      },
    );
    const event = vi.fn();
    const error = vi.fn();
    const stop = watchScreen(job, event, error);
    source!.onmessage!(
      new MessageEvent("message", {
        data: JSON.stringify({ ...job, status: "done" }),
      }),
    );
    expect(event.mock.calls[0][0].status).toBe("done");
    expect(source!.close).toHaveBeenCalledOnce();
    stop();
    expect(source!.close).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });
  it("keeps mock uploads outside preregistration and cancels progress timers", async () => {
    vi.stubEnv("VITE_USE_MOCK", "1");
    vi.useFakeTimers();
    const uploaded = await startScreen(
      "upload-project",
      "GSE132903",
      new File(["gene,log2fc,stat,fdr"], "test.csv"),
    );
    expect(uploaded.signature_id).toBeNull();
    expect(uploaded.preregistered).toBe(false);
    const event = vi.fn();
    const stop = watchScreen(uploaded, event, vi.fn());
    vi.advanceTimersByTime(300);
    expect(event).toHaveBeenCalledOnce();
    stop();
    vi.advanceTimersByTime(6000);
    expect(event).toHaveBeenCalledOnce();
  });
});
