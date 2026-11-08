import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  FlaskIcon,
  MinusCircleIcon,
  QuestionIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { Schema } from "@/api/types";
import { Panel, StatusBadge } from "@/components/system";
import type { Tone } from "@/components/system/StatusBadge";
import { cn } from "cn";

type Sourcing = Schema<"Sourcing">;

export const SOURCING_SOURCE = "Broad Drug Repurposing Hub sample QC (2020)";
export const SOURCING_TIP =
  "Purities the Broad measured on vendor samples bought around 2020. Any lab must re-check the purity of its own sample.";

const STATE: Record<
  Sourcing["status"],
  { badge: string; tone: Tone; icon: ReactNode; line: (s: Sourcing) => string }
> = {
  at_or_above_95: {
    badge: "95% or more on record",
    tone: "ok",
    icon: <CheckCircleIcon weight="bold" />,
    line: () => "A vendor sample with purity of 95% or more is on record.",
  },
  below_95: {
    badge: "below 95% only",
    tone: "gap",
    icon: <WarningCircleIcon weight="bold" />,
    line: (s) =>
      `${s.n_samples === 1 ? "One vendor sample is" : "Vendor samples are"} on record, but none reached 95% purity.`,
  },
  no_purity_value: {
    badge: "no purity value",
    tone: "neutral",
    icon: <QuestionIcon weight="bold" />,
    line: () => "Vendor samples are on record, but none has a usable purity value.",
  },
  no_record: {
    badge: "no record",
    tone: "neutral",
    icon: <MinusCircleIcon weight="bold" />,
    line: () => "No vendor sample of this compound is on record in the Repurposing Hub.",
  },
};

const MATCH_NOTE: Partial<Record<Sourcing["match"], string>> = {
  inchikey_block: "Matched on the core structure: the sample may be a different salt or stereo form.",
  name: "Matched by name, not structure.",
};

function pct(v?: number) {
  return v == null ? "unspecified" : `${v.toFixed(v >= 99.995 ? 0 : 2)}%`;
}

/** Before the lab: vendor samples and their measured purity. Display only. */
export function SourcingPanel({
  sourcing,
  className,
}: {
  sourcing: Sourcing | null | undefined;
  className?: string;
}) {
  const s = sourcing ?? null;
  const state = s ? STATE[s.status] : null;
  const matchNote = s ? MATCH_NOTE[s.match] : undefined;
  return (
    <Panel
      title="Before the lab: purity and sourcing"
      icon={<FlaskIcon />}
      caption={SOURCING_SOURCE}
      aria-label="Before the lab: purity and sourcing"
      className={className}
    >
      {s && state ? (
        <div
          className={cn(
            "grid gap-4",
            s.status !== "no_record" &&
              "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center",
          )}
        >
          <div className="grid justify-items-start gap-1.5">
            <StatusBadge tone={state.tone} tip={SOURCING_TIP} tabIndex={0} className="mb-1">
              {state.icon}
              {state.badge}
            </StatusBadge>
            <p className="m-0 text-[14px] leading-snug text-ink">{state.line(s)}</p>
            {matchNote && <p className="m-0 text-[12px] text-ink-3">{matchNote}</p>}
            {s.qc_incompatible && (
              <p className="m-0 text-[12px] text-ink-3">
                {s.n_qc_incompatible === 1 ? "1 sample" : `${s.n_qc_incompatible} samples`} could
                not be checked by the Broad method and {s.n_qc_incompatible === 1 ? "is" : "are"} not
                counted.
              </p>
            )}
          </div>
          {s.status !== "no_record" && (
            <dl className="m-0 grid grid-cols-2 gap-3 rounded-[12px] bg-frost/55 p-4 ring-1 ring-rim/80 sm:grid-cols-4">
              <Meta label="Best recorded purity" value={pct(s.best_purity_pct)} strong />
              <Meta
                label="Samples"
                value={`${s.n_samples}${s.n_samples_at_or_above_95 ? ` (${s.n_samples_at_or_above_95} at 95%+)` : ""}`}
              />
              <Meta
                label={s.n_vendors === 1 ? "Vendor" : `Vendors (${s.n_vendors})`}
                value={s.n_vendors ? s.vendors.join(", ") : "unspecified"}
              />
              <Meta
                label="Best sample"
                value={s.best_vendor ?? "unspecified"}
                sub={s.best_vendor && s.best_catalog_no ? `catalog ${s.best_catalog_no}` : undefined}
              />
            </dl>
          )}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-ink-3">Purity record not available in this build</p>
      )}
    </Panel>
  );
}

function Meta({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          "m-0 font-mono break-words text-ink",
          strong ? "text-[17px] tabular-nums" : "text-[13px]",
        )}
      >
        {value}
        {sub && <span className="block text-[11.5px] text-ink-3">{sub}</span>}
      </dd>
    </div>
  );
}
