import { lazy, Suspense, type ComponentType } from "react";
import { useDrug, useDrugResources } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { STEPS, useUi, type StepId } from "@/store/ui";
import { ProteinPanel } from "../protein-viewer/ProteinPanel";
import "../repurposing/mvp.css";

type MoleculeProps = { molecule: Schema<"Molecule3D"> | null | undefined };
// Track C owns this module. Resolve it when present without inventing coordinates.
const moleculeModules = import.meta.glob<{
  MoleculeViewer: ComponentType<MoleculeProps>;
}>("../molecule/MoleculeViewer.tsx");
const moleculeLoader = moleculeModules["../molecule/MoleculeViewer.tsx"];
const MoleculeViewer = moleculeLoader
  ? lazy(async () => ({ default: (await moleculeLoader()).MoleculeViewer }))
  : null;
const resourceNames = {
  tauchstone_lincs_gold: "LINCS gold · Tauchstone",
  clue: "CLUE connectivity",
  perturb_seqr: "Perturb-Seqr",
};

export function ContextMap({
  contexts,
}: {
  contexts: Schema<"ContextCell">[];
}) {
  const lines = [...new Set(contexts.map((c) => c.cell_id))];
  const concentrations = [...new Set(contexts.map((c) => c.dose))];
  return (
    <section
      className="mvp-card mvp-panel"
      style={{ marginTop: 12 }}
      aria-label="Ranking context map"
    >
      <h3>Where the reversal was measured</h3>
      {contexts.length ? (
        <div className="mvp-scroll">
          <table className="mvp-context">
            <caption className="sr-only">
              Ranking contexts · cell lines × concentrations
            </caption>
            <thead>
              <tr>
                <th scope="col">Cell line</th>
                {concentrations.map((dose) => (
                  <th key={dose} scope="col">
                    {dose.replace("uM", "µM")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line}>
                  <th scope="row">{line}</th>
                  {concentrations.map((dose) => {
                    const cells = contexts.filter(
                      (c) => c.cell_id === line && c.dose === dose,
                    );
                    return (
                      <td key={dose} data-filled={cells.length > 0}>
                        {cells.length
                          ? cells.map((c, i) => (
                              <div key={`${c.time}-${i}`}>
                                <span aria-label="Ranking context">●</span>
                                <span
                                  className="mvp-muted"
                                  style={{ display: "block", fontSize: 10 }}
                                >
                                  {c.time}
                                </span>
                              </div>
                            ))
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <span className="mvp-muted">Ranking contexts unavailable</span>
      )}
      <div className="mvp-chips" style={{ marginTop: 10 }}>
        {contexts.some(
          (c) => c.neural || /^(NEU|SHSY5Y|MNEU|NPC|FIBRNPC)/.test(c.cell_id),
        ) ? (
          <span className="mvp-chip ok">Neural-line ranking data</span>
        ) : (
          <span className="mvp-chip warm">No neural-line ranking data</span>
        )}
        <span className="mvp-muted">Ranking contexts only</span>
      </div>
    </section>
  );
}
export function EvidenceView({
  projectId,
  onCompare,
  onReport,
}: {
  projectId?: string;
  onCompare?: (id: string) => void;
  onReport?: (id: string) => void;
} = {}) {
  const { selectedCandidateId, setStep } = useUi();
  const {
    data: drug,
    isPending,
    isError,
    refetch,
  } = useDrug(selectedCandidateId, projectId);
  const resources = useDrugResources(selectedCandidateId);
  const mock = useMockStatus(drug?.provenance);
  function navigate(step: string) {
    setStep(step as StepId);
  }
  const canNavigate = (step: string) =>
    STEPS.some((item) => String(item.id) === step);
  return (
    <div className="mvp-view">
      <BoundaryBanner />
      <MockRibbon show={mock} />
      <div className="mvp-body">
        {!selectedCandidateId ? (
          <div className="mvp-state">
            <h2>Drug</h2>
            <button
              className="mvp-btn primary"
              onClick={() => setStep("candidates")}
            >
              Choose candidate
            </button>
          </div>
        ) : isPending ? (
          <div className="mvp-state" role="status">
            Loading drug…
          </div>
        ) : null}
        {isError && (
          <div className="mvp-state" role="alert">
            Drug unavailable{" "}
            <button className="mvp-btn" onClick={() => void refetch()}>
              Retry
            </button>
          </div>
        )}
        {drug && (
          <>
            <div className="mvp-grid">
              <div>
                {MoleculeViewer ? (
                  <Suspense
                    fallback={
                      <div className="mvp-molecule">Loading molecule…</div>
                    }
                  >
                    <MoleculeViewer molecule={drug.molecule} />
                  </Suspense>
                ) : (
                  <div
                    className="mvp-molecule"
                    role="img"
                    aria-label="Molecule coordinates unavailable"
                  >
                    <span>Molecule unavailable</span>
                    <span className="mvp-muted">
                      {drug.molecule?.formula ??
                        (drug.name.toLowerCase() === "piperacillin"
                          ? "C23H27N5O7S"
                          : "Formula unspecified")}
                    </span>
                    <span className="mvp-chip">3D coordinates pending</span>
                  </div>
                )}
                <ContextMap contexts={drug.contexts} />
              </div>
              <div>
                <div className="mvp-muted">
                  Pool rank {drug.pool_rank ?? "unspecified"} /{" "}
                  {(drug.rank_total ?? 1816).toLocaleString("en-US")} ·{" "}
                  {drug.approval_status?.status ?? "unspecified"}
                </div>
                <h2 style={{ fontSize: 28, margin: "3px 0 12px" }}>
                  {drug.name}
                </h2>
                <div className="mvp-chips">
                  {!drug.preregistered && (
                    <span className="mvp-chip warm">not preregistered</span>
                  )}
                  {drug.gaps.cancer_lines_only && (
                    <span className="mvp-chip bad">Cancer lines only</span>
                  )}
                  {drug.gaps.doses_um.length ? (
                    drug.gaps.doses_um.map((value) => (
                      <span key={value} className="mvp-chip warm">
                        {value} µM
                        {drug.gaps.doses_um.length === 1 ? " only" : ""}
                      </span>
                    ))
                  ) : (
                    <span className="mvp-chip">Concentration unspecified</span>
                  )}
                  {drug.gaps.times_h.length ? (
                    drug.gaps.times_h.map((value) => (
                      <span key={value} className="mvp-chip warm">
                        {value} h{drug.gaps.times_h.length === 1 ? " only" : ""}
                      </span>
                    ))
                  ) : (
                    <span className="mvp-chip">Time unspecified</span>
                  )}
                  <span
                    className={`mvp-chip ${drug.gaps.exposure.label.includes("low") ? "bad" : "warm"}`}
                  >
                    Brain exposure · {drug.gaps.exposure.label}
                  </span>
                  {!drug.gaps.has_targets && (
                    <span className="mvp-chip warm">No recorded targets</span>
                  )}
                  {drug.gaps.brain_cells.map((cell) => (
                    <span key={cell.cell_id} className="mvp-chip ok">
                      Brain-cell data · {cell.cell_id}{" "}
                      {cell.consensus.toFixed(2)}
                    </span>
                  ))}
                </div>
                <dl className="mvp-facts">
                  <div>
                    <dt className="mvp-muted">Reversal</dt>
                    <dd className="mvp-score">{drug.consensus.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="mvp-muted">Contexts</dt>
                    <dd>{drug.n_contexts}</dd>
                  </div>
                  <div>
                    <dt className="mvp-muted">Hidden tests</dt>
                    <dd>{drug.n_hidden_tests ?? "—"}</dd>
                  </div>
                </dl>
                <section
                  className="mvp-card mvp-panel"
                  aria-label="Agreement across resources"
                >
                  <h3>Agreement across resources</h3>
                  {resources.isPending && (
                    <span role="status" className="mvp-muted">
                      Loading resources…
                    </span>
                  )}
                  {resources.isError && (
                    <div role="alert">
                      Resources unavailable{" "}
                      <button
                        className="mvp-btn"
                        onClick={() => void resources.refetch()}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {resources.data?.map((resource) => (
                    <div className="mvp-resource" key={resource.resource}>
                      <span>{resourceNames[resource.resource]}</span>
                      {resource.status === "available" &&
                      resource.rank != null ? (
                        <span className="mvp-chip ac">
                          rank {resource.rank.toLocaleString("en-US")}
                          {resource.n_ranked != null
                            ? ` / ${resource.n_ranked.toLocaleString("en-US")}`
                            : ""}
                        </span>
                      ) : resource.status === "needs_key" ? (
                        <button
                          className="mvp-btn"
                          onClick={() => {
                            const dialog = document.getElementById(
                              "resource-key-help",
                            ) as HTMLDialogElement | null;
                            dialog?.showModal();
                          }}
                        >
                          Add API key
                        </button>
                      ) : (
                        <span className="mvp-chip">
                          {resource.status === "not_found"
                            ? "not found"
                            : resource.status === "not_fetched"
                              ? "not fetched"
                              : "not available"}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="mvp-muted" style={{ marginTop: 10 }}>
                    Report only · not preregistered
                  </div>
                </section>
                <dialog
                  id="resource-key-help"
                  className="mvp-card mvp-panel"
                  style={{ margin: "auto", maxWidth: 400 }}
                >
                  <h3>CLUE API key</h3>
                  <div className="mvp-chip">
                    Workspace administrator · API key required
                  </div>
                  <form method="dialog" style={{ marginTop: 14 }}>
                    <button className="mvp-btn">Close</button>
                  </form>
                </dialog>
                <div className="mvp-actions" style={{ marginTop: 14 }}>
                  <button
                    className="mvp-btn primary"
                    onClick={() => setStep("attack")}
                  >
                    {drug.attack_ready ? "Attack" : "Build tests"}
                  </button>
                  <button
                    className="mvp-btn"
                    disabled={!onCompare && !canNavigate("compare")}
                    title={
                      !onCompare && !canNavigate("compare")
                        ? "Compare shell pending"
                        : undefined
                    }
                    onClick={() =>
                      onCompare ? onCompare(drug.drug_id) : navigate("compare")
                    }
                  >
                    Compare
                  </button>
                  <button
                    className="mvp-btn"
                    disabled={!onReport && !canNavigate("report")}
                    title={
                      !onReport && !canNavigate("report")
                        ? "Report shell pending"
                        : undefined
                    }
                    onClick={() =>
                      onReport ? onReport(drug.drug_id) : navigate("report")
                    }
                  >
                    Report
                  </button>
                </div>
              </div>
            </div>
            <section style={{ marginTop: 20 }} aria-label="Targets">
              <h3>Targets</h3>
              {drug.targets?.length ? (
                <div className="mvp-chips">
                  {drug.targets.map((target) => (
                    <span key={target.entrez_id} className="mvp-chip">
                      {target.symbol} · Entrez {target.entrez_id} ·{" "}
                      {target.uniprot}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="mvp-muted">No recorded targets</span>
              )}
            </section>
            <section style={{ marginTop: 20 }}>
              <h3>Protein structure · target context</h3>
              <ProteinPanel url={drug.structure?.url ?? null} note={null} />
            </section>
          </>
        )}
      </div>
      <ProvenanceStrip provenance={drug?.provenance} />
    </div>
  );
}
