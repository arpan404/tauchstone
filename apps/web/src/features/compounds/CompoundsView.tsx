import { useState } from "react";
import { useLookup } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { useUi } from "@/store/ui";
import "../repurposing/mvp.css";

export function CompoundsView({
  projectId,
  onBuildTests,
}: {
  projectId?: string;
  onBuildTests?: (result: Schema<"LookupResult">) => void;
} = {}) {
  const [input, setInput] = useState(
    "donepezil, memantine, galantamine, rivastigmine, nepafenac",
  );
  const lookup = useLookup();
  const mock = useMockStatus();
  const { selectCandidate, setStep } = useUi();
  const names = input
    .split(/[,\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  function attack(result: Schema<"LookupResult">) {
    if (onBuildTests && !result.attack_ready) {
      onBuildTests(result);
      return;
    }
    if (!result.drug_id) return;
    selectCandidate(result.drug_id);
    setStep("attack");
  }
  return (
    <div className="mvp-view">
      <BoundaryBanner />
      <MockRibbon show={mock} />
      <div className="mvp-body">
        <h2>My compounds</h2>
        <div className="mvp-grid mvp-compounds-grid">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookup.mutate({
                names,
                ...(projectId ? { project_id: projectId } : {}),
              });
            }}
          >
            <label
              htmlFor="compound-names"
              style={{ display: "block", fontWeight: 650, marginBottom: 10 }}
            >
              Paste compound names
            </label>
            <textarea
              id="compound-names"
              className="mvp-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                lookup.reset();
              }}
              placeholder="Compound names · comma or newline"
            />
            <div className="mvp-actions" style={{ marginTop: 12 }}>
              <button
                className="mvp-btn primary"
                type="submit"
                disabled={!names.length || lookup.isPending}
              >
                {lookup.isPending ? "Checking…" : "Check"}
              </button>
              <span className="mvp-chip warm">not preregistered</span>
            </div>
            {lookup.isError && (
              <div role="alert" className="mvp-state">
                Lookup unavailable
              </div>
            )}
          </form>
          <div className="mvp-card mvp-scroll" aria-live="polite">
            <table className="mvp-table" aria-label="Compound results">
              <thead>
                <tr>
                  {["Compound", "Pool rank", "Score", "Contexts", ""].map(
                    (h, i) => (
                      <th key={i} scope="col">
                        {h || "Action"}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {lookup.data?.map((result, i) => (
                  <tr key={`${result.query}-${i}`}>
                    <td>{result.name ?? result.query}</td>
                    <td>
                      {result.status === "ranked" ? (
                        `${result.pool_rank?.toLocaleString("en-US") ?? "—"} / ${(result.rank_total ?? 1816).toLocaleString("en-US")}`
                      ) : (
                        <span className="mvp-chip warm">
                          {result.status === "not_rankable"
                            ? "not rankable"
                            : "not in LINCS"}
                        </span>
                      )}
                    </td>
                    <td
                      className={
                        result.consensus != null && result.consensus < 0
                          ? "mvp-score"
                          : ""
                      }
                    >
                      {result.consensus == null
                        ? "—"
                        : `${result.consensus > 0 ? "+" : ""}${result.consensus.toFixed(2)}`}
                    </td>
                    <td>{result.n_contexts ?? "—"}</td>
                    <td>
                      {result.status === "ranked" && (
                        <button
                          className={`mvp-btn ${result.attack_ready ? "primary" : ""}`}
                          disabled={!result.drug_id && !onBuildTests}
                          onClick={() => attack(result)}
                        >
                          {result.attack_ready ? "Attack" : "Build tests"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!lookup.data?.length && (
                  <tr>
                    <td colSpan={5} className="mvp-muted">
                      {lookup.isPending ? "Checking…" : "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
export const MyCompoundsView = CompoundsView;
