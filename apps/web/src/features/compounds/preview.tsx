// Development-only entry while Track B1 owns the application routes.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RepurposingView } from "../repurposing/RepurposingView";
import { EvidenceView } from "../evidence/EvidenceView";
import { CompoundsView } from "./CompoundsView";
import { useUi } from "@/store/ui";
import "@/index.css";

export function Preview() {
  const [page, setPage] = useState("candidates");
  const { step, setStep, selectCandidate } = useUi();
  const view =
    page === "compounds"
      ? "compounds"
      : step === "evidence"
        ? "drug"
        : "candidates";
  return (
    <div
      style={{
        height: "100dvh",
        display: "grid",
        gridTemplateColumns: "200px minmax(0,1fr)",
        background: "#f6f5f1",
        color: "#14131a",
      }}
    >
      <aside
        style={{
          background: "white",
          borderRight: "1px solid #e6e2d8",
          padding: 16,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 650, marginBottom: 28 }}>
          Tauchstone
        </div>
        <div className="mvp-muted" style={{ marginBottom: 12 }}>
          Track B2 preview
        </div>
        {["candidates", "drug", "compounds"].map((id) => (
          <button
            className={`mvp-btn ${view === id ? "primary" : ""}`}
            key={id}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              marginBottom: 6,
            }}
            onClick={() => {
              setPage(id);
              if (id === "drug") {
                selectCandidate("MOCK-0005");
                setStep("evidence");
              } else setStep("candidates");
            }}
          >
            {id === "compounds"
              ? "My compounds"
              : id === "drug"
                ? "Drug"
                : "Candidates"}
          </button>
        ))}
      </aside>
      <main style={{ minWidth: 0, minHeight: 0 }}>
        {view === "compounds" ? (
          <CompoundsView />
        ) : view === "drug" ? (
          <EvidenceView />
        ) : (
          <RepurposingView />
        )}
      </main>
    </div>
  );
}
const root = document.getElementById("root");
if (root) {
  const previewRoot = createRoot(root);
  previewRoot.render(
    <QueryClientProvider client={new QueryClient()}>
      <Preview />
    </QueryClientProvider>,
  );

  import.meta.hot?.dispose(() => previewRoot.unmount());
}
