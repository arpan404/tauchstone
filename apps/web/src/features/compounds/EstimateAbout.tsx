import { useId, useState } from "react";
import { CaretDownIcon, InfoIcon } from "@phosphor-icons/react";
import { Panel, Readout, StatusBadge, type Tone } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { useEstimateModels, type EstimateModels } from "./useEstimateModels";
import { useStructureModel, type StructureModel } from "./useStructureModel";

const STATUS: Record<StructureModel["status"], { label: string; tone: Tone }> = {
  ready: { label: "ready", tone: "ok" },
  training: { label: "training", tone: "neutral" },
  not_trained: { label: "not trained", tone: "neutral" },
  failed: { label: "unavailable", tone: "neutral" },
};

const MESSAGE: Record<Exclude<StructureModel["status"], "ready">, string> = {
  not_trained: "The structure model has not been trained on this server, so no AI estimates are shown.",
  training: "The structure model is training. AI estimates appear once it is ready.",
  failed: "The structure model is not available right now, so no AI estimates are shown.",
};

function fixed(value: number | null | undefined, digits: number) {
  return value == null ? "n/a" : value.toFixed(digits);
}

function Plain({ children }: { children: string }) {
  return <p className="m-0 text-[13px] text-ink-2">{children}</p>;
}

/** Two decimals with an explicit sign; values that round to zero show as 0.00. */
function signed(value: number) {
  const text = Math.abs(value).toFixed(2);
  if (Number(text) === 0) return "0.00";
  return (value > 0 ? "+" : "-") + text;
}

/** One row per model on the same held-out compounds, which one is used, and the outcome. */
function Comparison({ enabled }: { enabled: boolean }) {
  const query = useEstimateModels(enabled);
  const data: EstimateModels | undefined = query.data;
  if (!data || !Array.isArray(data.models) || data.models.length < 2) return null;
  return (
    <div>
      <p className="m-0 mb-1 text-[12px] font-medium text-ink-3">How it compares</p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-rim/80">
        <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-[12px]">
          <thead className="bg-frost/55 text-left text-ink-3">
            <tr>
              <th scope="col" className="px-3 py-2 font-normal">Model</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Spearman</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Change vs current (95% range)</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Error (guessing the mean)</th>
            </tr>
          </thead>
          <tbody>
            {data.models.map((row) => (
              <tr key={row.name} className="align-top">
                <th scope="row" className="border-t border-rim/60 px-3 py-2 text-left font-normal text-ink">
                  <span className="mr-2">{row.label}</span>
                  {row.served && (
                    <StatusBadge size="sm" tone="ok" tip="This model gives the AI estimate shown on this page.">
                      in use
                    </StatusBadge>
                  )}
                </th>
                <td className="border-t border-rim/60 px-3 py-2 text-right font-mono tabular-nums">
                  {fixed(row.spearman, 2)}
                </td>
                <td className="border-t border-rim/60 px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                  {row.spearman_vs_served == null || !row.spearman_vs_served_ci95
                    ? "current"
                    : `${signed(row.spearman_vs_served)} (${signed(row.spearman_vs_served_ci95[0])} to ${signed(row.spearman_vs_served_ci95[1])})`}
                </td>
                <td className="border-t border-rim/60 px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                  {fixed(row.mae, 3)} ({fixed(row.baseline_mae, 3)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-2 text-ink">{data.outcome}</p>
      <p className="m-0 mt-1 text-[12px] text-ink-3">
        All scored on the same {data.n_test.toLocaleString("en-US")} held-out compounds. A new model is used only if
        it ranks them better and the whole 95% range of the change is above zero, a rule written down before these
        models were trained.
      </p>
    </div>
  );
}

function Body({ enabled }: { enabled: boolean }) {
  const model = useStructureModel(enabled);
  if (model.isPending) return <Skeleton className="h-16 w-full rounded-xl bg-ink/[0.06]" />;
  if (model.isError || !model.data) return <Plain>{MESSAGE.failed}</Plain>;
  const { status, report } = model.data;
  if (status !== "ready" || !report) return <Plain>{MESSAGE[status === "ready" ? "failed" : status] ?? MESSAGE.failed}</Plain>;
  const m = report.metrics;
  return (
    <div className="space-y-4 text-[13px] text-ink-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge size="sm" tone={STATUS.ready.tone} tip={false}>
          {STATUS.ready.label}
        </StatusBadge>
        <span className="text-[12px] text-ink-3">run</span>
        <span className="font-mono text-[12px] break-all text-ink-2">{report.run_id}</span>
      </div>
      <p className="m-0">
        A random forest on {report.feature_count.toLocaleString("en-US")}-bit Morgan fingerprints of the chemical
        structure, predicting the GSE132903 reversal score.
      </p>
      <div className="rounded-xl bg-frost/55 p-3 ring-1 ring-rim/80">
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Readout size="sm" label="Mean absolute error" value={fixed(m.mae, 3)} />
          <Readout size="sm" label="Guessing the training mean" value={fixed(m.baseline_mae, 3)} />
          <Readout size="sm" label="R²" value={fixed(m.r2, 3)} />
          <Readout size="sm" label="Spearman" value={fixed(m.spearman, 2)} />
        </dl>
        <p className="m-0 mt-3 text-[12px] text-ink-3">
          On {report.n_test.toLocaleString("en-US")} compounds whose structures were held out by scaffold group.
          Lower error is better; the model is barely better than always guessing the training mean.
        </p>
      </div>
      <Comparison enabled={enabled} />
      {report.limitations.length > 0 && (
        <div>
          <p className="m-0 mb-1 text-[12px] font-medium text-ink-3">Limitations</p>
          <ul className="m-0 list-disc space-y-0.5 pl-5">
            {report.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 text-[12px] text-ink-3">
        It never changes the ranking, the hidden tests or any verdict.
      </p>
    </div>
  );
}

/** Closed-by-default explanation of the structure-only AI estimate. No training controls here. */
export function EstimateAbout({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Panel
      title="About this estimate"
      icon={<InfoIcon />}
      className={className}
      flush={!open}
      bodyClassName={open ? undefined : "pb-3"}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          <CaretDownIcon aria-hidden className={cn("transition-transform", open && "rotate-180")} />
          {open ? "Hide" : "Show"}
        </Button>
      }
    >
      <div id={id} hidden={!open}>
        {open && <Body enabled={open} />}
      </div>
    </Panel>
  );
}
