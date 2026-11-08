import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute } from "./useUrlSync";

describe("URL routes", () => {
  it("round-trips drug pages with a project", () => {
    const route = { step: "evidence" as const, drug: "BRD-K86873305", project: "GSE132903" };
    expect(formatRoute(route)).toBe("#/drug/BRD-K86873305?project=GSE132903");
    expect(parseRoute(formatRoute(route))).toEqual(route);
  });
  it("drops the drug on pages that do not show one", () => {
    expect(formatRoute({ step: "candidates", drug: "BRD-X", project: null })).toBe("#/candidates");
    expect(parseRoute("#/validation")).toEqual({ step: "benchmark", drug: null, project: null });
  });
  it("ignores unknown or empty hashes", () => {
    expect(parseRoute("")).toBeNull();
    expect(parseRoute("#/nowhere")).toBeNull();
  });
  it("round-trips upload project ids with spaces and slashes", () => {
    const route = { step: "report" as const, drug: "BRD A/1", project: "my project" };
    expect(parseRoute(formatRoute(route))).toEqual(route);
  });
});
