import { lazy, Suspense, type ReactNode } from "react";
import { CandidatePicker } from "@/app/CandidatePicker";
import {
  ArrowSquareOutIcon,
  ColumnsIcon,
  CrosshairIcon,
  FileTextIcon,
  PillIcon,
} from "@phosphor-icons/react";
import { useDrug, useDrugResources } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import {
  EmptyState,
  Panel,
  Readout,
  StatusBadge,
  Term,
  WithdrawnBadge,
  GLOSSARY,
  type Tone,
} from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { STEPS, useUi, type StepId } from "@/store/ui";
import { ContextMap } from "./ContextMap";
import { int, signed } from "./format";
import { ResourceAgreement } from "./ResourceAgreement";
import { StructurePanel, TargetsPanel } from "./TargetsPanel";

export { ContextMap } from "./ContextMap";

const MoleculeViewer = lazy(() =>
  import("../molecule/MoleculeViewer").then((m) => ({
    default: m.MoleculeViewer,
  })),
);

type Drug = Schema<"DrugDetail">;

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
  // Started alongside the drug query so both arrive together.
  const resources = useDrugResources(selectedCandidateId);
  const mock = useMockStatus(drug?.provenance);
  const canNavigate = (step: string) =>
    STEPS.some((item) => String(item.id) === step);

  let body: ReactNode;
  if (!selectedCandidateId) {
    body = (
      <EmptyState
        className="min-h-80"
        icon={<PillIcon />}
        title="No candidate selected"
        action={<div className="flex flex-col items-center gap-2"><CandidatePicker variant="button" /><Button variant="ghost" size="sm" onClick={() => setStep("candidates")}>Browse candidates</Button></div>}
      />
    );
  } else if (isError) {
    body = (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 text-[13.5px] text-ink-2"
      >
        Drug unavailable
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (isPending || !drug) {
    body = <DrugSkeleton />;
  } else {
    body = (
      <>
        <DrugHeader
          drug={drug}
          onAttack={() => setStep("attack")}
          compareDisabled={!onCompare && !canNavigate("compare")}
          reportDisabled={!onReport && !canNavigate("report")}
          onCompare={() =>
            onCompare ? onCompare(drug.drug_id) : setStep("compare" as StepId)
          }
          onReport={() =>
            onReport ? onReport(drug.drug_id) : setStep("report" as StepId)
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <MoleculePanel drug={drug} className="lg:col-span-5" />
          <ContextMap contexts={drug.contexts} className="lg:col-span-7" />
          <ResourceAgreement resources={resources} className="lg:col-span-5" />
          <TargetsPanel targets={drug.targets ?? []} className="lg:col-span-7" />
          {drug.structure && (
            <StructurePanel structure={drug.structure} className="lg:col-span-12" />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mock} />
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 md:p-6">
        {body}
      </div>
      <ProvenanceStrip provenance={drug?.provenance} />
    </div>
  );
}

function DrugHeader({
  drug,
  onAttack,
  onCompare,
  onReport,
  compareDisabled,
  reportDisabled,
}: {
  drug: Drug;
  onAttack: () => void;
  onCompare: () => void;
  onReport: () => void;
  compareDisabled: boolean;
  reportDisabled: boolean;
}) {
  const approval = drug.approval_status;
  return (
    <section
      aria-label="Drug summary"
      className="rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-wrap items-end gap-x-10 gap-y-5 px-5 pt-5 pb-4">
        <div className="min-w-[min(100%,16rem)] flex-1">
          <div className="font-mono text-[12px] text-ink-3">{drug.drug_id}</div>
          <h2 className="mt-1 mb-2 font-heading text-[28px] leading-tight font-semibold tracking-tight text-ink [font-stretch:92%]">
            {drug.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <ApprovalBadge approval={approval} />
            <WithdrawnBadge approval={approval} />
            {!drug.preregistered && (
              <StatusBadge tone="gap">not preregistered</StatusBadge>
            )}
            {drug.mechanism && (
              <span className="ml-1 truncate text-[13px] text-ink-2">
                {drug.mechanism}
              </span>
            )}
          </div>
        </div>
        <dl className="m-0 flex flex-wrap items-end gap-x-8 gap-y-3">
          <Readout
            label={<Term term="poolRank">Pool rank</Term>}
            value={
              <>
                {drug.pool_rank ?? "unspecified"}
                <span className="text-ink-3">
                  {" "}
                  / {int(drug.rank_total ?? 1816)}
                </span>
              </>
            }
          />
          <Readout label={<Term term="contexts">Contexts</Term>} value={drug.n_contexts} />
          <Readout
            label={<Term term="hiddenTests">Hidden tests</Term>}
            value={drug.n_hidden_tests ?? "unspecified"}
          />
          <ReversalReadout drug={drug} />
        </dl>
      </div>
      {/* Wraps instead of squeezing: the actions drop below the gaps when the row is too narrow. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
        <div className="min-w-0 flex-[1_1_28rem]">
          <GapBadges gaps={drug.gaps} />
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <Button onClick={onAttack}>
            <CrosshairIcon />
            {drug.attack_ready ? "Attack" : "Build tests"}
          </Button>
          <Button variant="outline" disabled={compareDisabled} onClick={onCompare}>
            <ColumnsIcon />
            Compare
          </Button>
          <Button variant="outline" disabled={reportDisabled} onClick={onReport}>
            <FileTextIcon />
            Report
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReversalReadout({ drug }: { drug: Drug }) {
  const s = drug.scores;
  return (
    <div className="border-l border-line pl-8">
      <Readout
        size="xl"
        tone="accent"
        label={
          <Term
            tip={
              <span className="flex flex-col gap-1">
                <span>{GLOSSARY.reversal}</span>
                {s && (
                  <span className="font-mono">
                    WTCS {signed(s.wtcs)} KS {signed(s.ks)} Cosine {signed(s.cosine)}
                  </span>
                )}
              </span>
            }
          >
            Reversal
          </Term>
        }
        value={signed(drug.consensus)}
      />
    </div>
  );
}

function ApprovalBadge({ approval }: { approval: Drug["approval_status"] }) {
  const status = approval?.status ?? "unspecified";
  const phase =
    approval?.max_phase != null ? ` · phase ${Math.round(approval.max_phase)}` : "";
  const url = approval?.source?.url;
  const badge = (
    <StatusBadge>
      {status}
      {phase}
      {url && <ArrowSquareOutIcon />}
    </StatusBadge>
  );
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${status}${phase} (${approval?.source?.label ?? "source"})`}
      className="rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {badge}
    </a>
  ) : (
    badge
  );
}

function GapBadges({ gaps }: { gaps: Drug["gaps"] }) {
  const badges: [string, Tone][] = [];
  if (gaps.cancer_lines_only) badges.push(["Cancer lines only", "bad"]);
  const doses = gaps.doses_um;
  if (doses.length === 1) badges.push([`${doses[0]} µM only`, "gap"]);
  else if (doses.length > 1)
    badges.push([`${Math.min(...doses)} to ${Math.max(...doses)} µM`, "neutral"]);
  else badges.push(["Concentration unspecified", "neutral"]);
  const times = gaps.times_h;
  if (times.length === 1) badges.push([`${times[0]} h only`, "gap"]);
  else if (times.length > 1) badges.push([`${times.join(", ")} h`, "neutral"]);
  else badges.push(["Time unspecified", "neutral"]);
  badges.push([
    `Brain exposure · ${gaps.exposure.label}`,
    gaps.exposure.label.includes("low") ? "bad" : "gap",
  ]);
  if (!gaps.has_targets) badges.push(["No recorded targets", "gap"]);
  for (const cell of gaps.brain_cells)
    badges.push([`Brain-cell data · ${cell.cell_id} ${signed(cell.consensus)}`, "ok"]);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Evidence gaps">
      {badges.map(([label, tone]) => (
        <li key={label}>
          <StatusBadge tone={tone}>{label}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

function MoleculePanel({ drug, className }: { drug: Drug; className?: string }) {
  const method = drug.molecule?.method;
  return (
    <Panel
      title="Molecule"
      flush
      // The viewer fills the panel so it matches the context map's height.
      className={cn(
        "flex flex-col overflow-hidden [&>div:last-child]:flex [&>div:last-child]:flex-1 [&>div:last-child]:flex-col",
        className,
      )}
      actions={
        method ? (
          <span className="max-w-56 truncate font-mono text-[11px] text-ink-3" title={method}>
            {method}
          </span>
        ) : null
      }
    >
      <div className="flex flex-1 flex-col [&>[data-testid=molecule-viewer]]:h-auto! [&>[data-testid=molecule-viewer]]:min-h-[300px] [&>[data-testid=molecule-viewer]]:flex-1 [&>[data-testid=molecule-viewer]]:rounded-none [&>[data-testid=molecule-viewer]]:border-0">
        <Suspense fallback={<Skeleton className="h-[300px] rounded-none" />}>
          <MoleculeViewer molecule={drug.molecule ?? null} height={300} />
        </Suspense>
      </div>
    </Panel>
  );
}

function DrugSkeleton() {
  return (
    <div role="status" aria-label="Loading drug" className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface">
        <div className="flex items-end gap-10 px-5 pt-5 pb-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-6 w-40" />
          </div>
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-12 w-28" />
        </div>
        <div className="flex gap-2 border-t border-line px-5 py-3">
          {[120, 80, 70, 190].map((w) => (
            <Skeleton key={w} className="h-6" style={{ width: w }} />
          ))}
          <Skeleton className="ml-auto h-9 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-[345px] rounded-lg lg:col-span-5" />
        <Skeleton className="h-[345px] rounded-lg lg:col-span-7" />
        <Skeleton className="h-40 rounded-lg lg:col-span-5" />
        <Skeleton className="h-40 rounded-lg lg:col-span-7" />
      </div>
    </div>
  );
}
