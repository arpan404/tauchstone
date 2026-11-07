import { useState } from "react";
import { useCreateProject, useProjects, workspaceMock } from "@/api/workspace";
import { useUi } from "@/store/ui";
import { Action, Chip } from "@/components/mvp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function ProjectsView() {
  const { data, isPending, error } = useProjects();
  const create = useCreateProject();
  const { setProject, setStep } = useUi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState("GSE132903");
  return (
    <div className="mvp-view">
      {isPending && <Chip>Loading</Chip>}
      {error && <Chip tone="bad">Projects unavailable</Chip>}
      <div className="mvp-projects">
        {data?.map((p) => (
          <button
            key={p.id}
            className="mvp-card mvp-project"
            onClick={() => {
              setProject(p.id);
              setStep(p.n_ranked ? "candidates" : "screen");
            }}
          >
            <span className="mvp-muted">
              {p.kind === "builtin" ? "Built-in" : "Upload"} ·{" "}
              {p.signature_id ?? "CSV"}
            </span>
            <strong>{p.name}</strong>
            <span className="mvp-chips">
              <Chip>
                {p.n_ranked
                  ? `${p.n_ranked.toLocaleString()} ranked`
                  : "not screened"}
              </Chip>
              {p.n_attack_ready != null && (
                <Chip>{p.n_attack_ready} attack-ready</Chip>
              )}
              {!p.preregistered && <Chip tone="gap">not preregistered</Chip>}
            </span>
            <progress
              className="mvp-progress"
              max={1}
              value={p.n_ranked ? 1 : 0}
              aria-label={`${p.name} screen progress`}
            />
          </button>
        ))}
        <button
          className="mvp-card mvp-project new"
          onClick={() => setOpen(true)}
        >
          ＋ New project
        </button>
      </div>
      <section className="mvp-card mvp-activity">
        <h2 className="mvp-heading">Recent activity</h2>
        <ul>
          {data
            ?.filter((p) => p.last_screen_id)
            .map((p) => (
              <li key={p.id}>
                {p.name} · Screen finished · {p.n_ranked?.toLocaleString()}{" "}
                ranked
              </li>
            ))}
          {!data?.some((p) => p.last_screen_id) && <li>No recent activity</li>}
        </ul>
        {workspaceMock() && <Chip tone="gap">Synthetic data</Chip>}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <form
            className="mvp-form"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { name: name.trim(), signature_id: signature || null },
                {
                  onSuccess: (p) => {
                    setProject(p.id);
                    setStep("screen");
                    setOpen(false);
                  },
                },
              );
            }}
          >
            <label>
              Name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Signature
              <select
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
              >
                <option value="GSE132903">
                  GSE132903 · middle temporal gyrus
                </option>
                <option value="GSE173955">GSE173955 · hippocampus</option>
                <option value="">Upload CSV</option>
              </select>
            </label>
            <Chip tone="gap">not preregistered</Chip>
            {create.error && <Chip tone="bad">Project unavailable</Chip>}
            <Action disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating" : "Create project"}
            </Action>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
