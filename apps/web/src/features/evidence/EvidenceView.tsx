import { lazy, Suspense, type ReactNode } from "react";
import { CandidatePicker } from "@/app/CandidatePicker";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  BrainIcon,
  ClockIcon,
  ColumnsIcon,
  CrosshairIcon,
  EyedropperIcon,
  FileTextIcon,
  FlaskIcon,
  GaugeIcon,
  PillIcon,
  SealCheckIcon,
  SquaresFourIcon,
  TargetIcon,
  TestTubeIcon,
  WarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useDrug, useDrugResources } from "@/api/mvpHooks";
import { useMockStatus } from "@/api/hooks";
import type { Schema } from "@/api/types";
import { BoundaryBanner } from "@/components/BoundaryBanner";
import { MockRibbon } from "@/components/MockRibbon";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import {
  EmptyState,
  StatusBadge,
  Term,
  WithdrawnBadge,
  GLOSSARY,
  type Tone,
} from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { NAV_ITEMS } from "@/app/nav";
import { useUi } from "@/store/ui";
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
  const { selectedCandidateId, setStep, compareIds, toggleCompare } = useUi();
  const {
    data: drug,
    isPending,
    isError,
    refetch,
  } = useDrug(selectedCandidateId, projectId);
  // Started alongside the drug query so both arrive together.
  const resources = useDrugResources(selectedCandidateId);
  const mock = useMockStatus(drug?.provenance);
  const canNavigate = (step: string) => NAV_ITEMS.some(([id]) => id === step);

  let body: ReactNode;
  if (!selectedCandidateId) {
    body = (
      <EmptyState
        className="min-h-80 rounded-[18px] border-solid border-white/80 bg-[var(--glass-bg)] shadow-[var(--glass-shadow)] backdrop-blur-xl"
        icon={
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-primary">
            <PillIcon className="size-6" weight="duotone" />
          </span>
        }
        title="No candidate selected"
        action={
          <div className="flex flex-col items-center gap-2">
            <CandidatePicker variant="button" />
            <Button variant="outline" onClick={() => setStep("candidates")}>
              Browse candidates
              <ArrowRightIcon />
            </Button>
          </div>
        }
      />
    );
  } else if (isError) {
    body = (
      <div
        role="alert"
        className="glass flex items-center gap-3 p-4 text-[13.5px] text-ink-2"
      >
        <WarningIcon className="size-4 text-bad" />
        Drug unavailable
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (isPending || !drug) {
    body = <DrugSkeleton />;
  } else {
    body = (
      <>
        <DrugHero
          drug={drug}
          onAttack={() => setStep("attack")}
          compareDisabled={!onCompare && !canNavigate("compare")}
          reportDisabled={!onReport && !canNavigate("report")}
          onCompare={() => {
            if (onCompare) return onCompare(drug.drug_id);
            // Opens Compare with this drug in the set (never toggles it out).
            if (!compareIds.includes(drug.drug_id)) toggleCompare(drug.drug_id);
            setStep("compare");
          }}
          onReport={() => (onReport ? onReport(drug.drug_id) : setStep("report"))}
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <ContextMap contexts={drug.contexts} className="xl:col-span-7" />
          <ResourceAgreement resources={resources} className="xl:col-span-5">
            <GapBadges gaps={drug.gaps} />
          </ResourceAgreement>
          <TargetsPanel
            targets={drug.targets ?? []}
            className={drug.structure ? "xl:col-span-5" : "xl:col-span-12"}
          />
          {drug.structure && (
            <StructurePanel structure={drug.structure} className="xl:col-span-7" />
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

/**
 * Areas: phones stack id, molecule, figures, actions. From md the molecule sits on the right;
 * from xl the actions share the bottom row with the figures, as in the approved mockup.
 */
const HERO_GRID =
  "grid gap-x-8 gap-y-5 [grid-template-areas:'id'_'mol'_'figs'_'acts'] md:grid-cols-[minmax(0,1fr)_minmax(240px,38%)] md:[grid-template-areas:'id_mol'_'figs_figs'_'acts_acts'] xl:grid-cols-[minmax(0,1fr)_minmax(340px,auto)] xl:[grid-template-areas:'id_mol'_'figs_acts']";

function DrugHero({
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
  const brainCells = drug.gaps.brain_cells;
  return (
    <section
      aria-label="Drug summary"
      className={cn("glass relative overflow-hidden px-6 pt-6 pb-6 md:px-7", HERO_GRID)}
    >
      <div className="min-w-0 [grid-area:id]">
        <div className="font-mono text-[12.5px] text-ink-3">{drug.drug_id}</div>
        <h2 className="mt-1.5 mb-3 font-heading text-[34px] leading-[1.02] font-normal tracking-[-0.035em] break-words text-ink [font-stretch:100%] md:text-[46px]">
          {drug.name}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <ApprovalBadge approval={approval} />
          <WithdrawnBadge approval={approval} />
          {brainCells.length > 0 && (
            <StatusBadge tone="ok">
              <BrainIcon />
              brain-cell data
            </StatusBadge>
          )}
          {!drug.preregistered && (
            <StatusBadge tone="gap">
              <WarningIcon />
              not preregistered
            </StatusBadge>
          )}
        </div>
        {drug.mechanism && (
          <p className="m-0 mt-3 max-w-xl text-[13px] text-ink-2">{drug.mechanism}</p>
        )}
      </div>

      <HeroMolecule drug={drug} />

      <dl className="m-0 flex flex-wrap items-end gap-x-10 gap-y-4 self-end [grid-area:figs] max-sm:[&>div:first-child]:basis-full">
        <ReversalFigure drug={drug} />
        <HeroStat
          icon={<SquaresFourIcon />}
          label={<Term term="contexts">Contexts</Term>}
          value={drug.n_contexts}
        />
        <HeroStat
          icon={<TestTubeIcon />}
          label={<Term term="hiddenTests">Hidden tests</Term>}
          value={drug.n_hidden_tests ?? "unspecified"}
        />
      </dl>

      <div className="flex flex-wrap items-end justify-start gap-2 self-end [grid-area:acts] md:justify-end max-sm:[&>button]:flex-1">
        <Button variant="outline" size="lg" className="h-10 px-4" disabled={compareDisabled} onClick={onCompare}>
          <ColumnsIcon />
          Compare
        </Button>
        <Button variant="outline" size="lg" className="h-10 px-4" disabled={reportDisabled} onClick={onReport}>
          <FileTextIcon />
          Report
        </Button>
        <Button size="lg" className="h-10 px-5 max-sm:order-first max-sm:basis-full!" onClick={onAttack}>
          <CrosshairIcon />
          {drug.attack_ready ? "Attack this claim" : "Build tests"}
        </Button>
      </div>
    </section>
  );
}

/**
 * The real 3D viewer, unboxed: transparent background, no border, formula as a pill.
 * The viewer's own styles are inline, so the overrides need `!`.
 */
function HeroMolecule({ drug }: { drug: Drug }) {
  return (
    <div
      className={cn(
        "relative -mx-2 min-w-0 [grid-area:mol] md:-my-2 md:mx-0",
        "[&_[data-testid=molecule-viewer]]:h-[220px]! [&_[data-testid=molecule-viewer]]:rounded-none [&_[data-testid=molecule-viewer]]:border-0 [&_[data-testid=molecule-viewer]]:bg-none! md:[&_[data-testid=molecule-viewer]]:h-[250px]!",
        "[&_[data-testid=molecule-formula]]:right-2 [&_[data-testid=molecule-formula]]:bottom-1 [&_[data-testid=molecule-formula]]:left-auto [&_[data-testid=molecule-formula]]:rounded-full [&_[data-testid=molecule-formula]]:bg-white/70 [&_[data-testid=molecule-formula]]:px-2.5 [&_[data-testid=molecule-formula]]:py-0.5 [&_[data-testid=molecule-formula]]:text-ink-2 [&_[data-testid=molecule-formula]]:shadow-none [&_[data-testid=molecule-formula]]:ring-1 [&_[data-testid=molecule-formula]]:ring-ink/10",
      )}
    >
      <Suspense fallback={<Skeleton className="h-[220px] rounded-[18px] bg-ink/[0.035] md:h-[250px]" />}>
        <MoleculeViewer molecule={drug.molecule ?? null} height={250} />
      </Suspense>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 pb-1">
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-3 [&>svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="m-0 mt-1 font-mono text-[26px] leading-none font-normal tracking-[-0.02em] text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function ReversalFigure({ drug }: { drug: Drug }) {
  const s = drug.scores;
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-3">
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
      </dt>
      <dd className="m-0 font-mono text-[46px] leading-[0.95] font-normal tracking-[-0.04em] text-primary tabular-nums md:text-[58px]">
        {signed(drug.consensus)}
      </dd>
      <dd className="m-0 mt-1.5 text-[13px] text-ink-2">
        <Term term="poolRank">
          {drug.pool_rank != null
            ? `rank ${int(drug.pool_rank)} of ${int(drug.rank_total ?? 1816)}`
            : "rank unspecified"}
        </Term>
      </dd>
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
      {status === "approved" && <SealCheckIcon className="text-primary" />}
      {status}
      {phase}
      {url && <ArrowSquareOutIcon className="text-ink-3" />}
    </StatusBadge>
  );
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${status}${phase} (${approval?.source?.label ?? "source"})`}
      className="rounded-full transition-colors hover:[&>span]:bg-white focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {badge}
    </a>
  ) : (
    badge
  );
}

function GapBadges({ gaps }: { gaps: Drug["gaps"] }) {
  const badges: [string, Tone, Icon][] = [];
  if (gaps.cancer_lines_only) badges.push(["Cancer lines only", "bad", WarningIcon]);
  const doses = gaps.doses_um;
  if (doses.length === 1) badges.push([`${doses[0]} µM only`, "gap", EyedropperIcon]);
  else if (doses.length > 1)
    badges.push([`${Math.min(...doses)} to ${Math.max(...doses)} µM`, "neutral", EyedropperIcon]);
  else badges.push(["Concentration unspecified", "neutral", EyedropperIcon]);
  const times = gaps.times_h;
  if (times.length === 1) badges.push([`${times[0]} h only`, "gap", ClockIcon]);
  else if (times.length > 1) badges.push([`${times.join(", ")} h`, "neutral", ClockIcon]);
  else badges.push(["Time unspecified", "neutral", ClockIcon]);
  badges.push([
    `Brain exposure · ${gaps.exposure.label}`,
    gaps.exposure.label.includes("low") ? "bad" : "gap",
    GaugeIcon,
  ]);
  if (!gaps.has_targets) badges.push(["No recorded targets", "gap", TargetIcon]);
  for (const cell of gaps.brain_cells)
    badges.push([
      `Brain-cell data · ${cell.cell_id} ${signed(cell.consensus)}`,
      "ok",
      BrainIcon,
    ]);
  return (
    <div>
      <h4 className="m-0 mb-2 flex items-center gap-1.5 text-[12px] font-normal text-ink-3">
        <FlaskIcon className="size-3.5" />
        Evidence gaps
      </h4>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Evidence gaps">
        {badges.map(([label, tone, BadgeIcon]) => (
          <li key={label}>
            <StatusBadge tone={tone}>
              <BadgeIcon />
              {label}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DrugSkeleton() {
  return (
    <div role="status" aria-label="Loading drug" className="flex flex-col gap-4">
      <div className={cn("glass px-6 pt-6 pb-6 md:px-7", HERO_GRID)}>
        <div className="space-y-3 [grid-area:id]">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-11 w-72 max-w-full" />
          <div className="flex gap-1.5">
            {[110, 90, 120].map((w) => (
              <Skeleton key={w} className="h-6 rounded-full" style={{ width: w }} />
            ))}
          </div>
        </div>
        <Skeleton className="h-[220px] rounded-[18px] [grid-area:mol] md:h-[250px]" />
        <div className="flex items-end gap-10 [grid-area:figs]">
          <Skeleton className="h-16 w-44" />
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-20" />
        </div>
        <div className="flex items-end justify-end gap-2 [grid-area:acts]">
          <Skeleton className="h-10 w-28 rounded-full" />
          <Skeleton className="h-10 w-24 rounded-full" />
          <Skeleton className="h-10 w-40 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-[345px] rounded-[18px] xl:col-span-7" />
        <Skeleton className="h-[345px] rounded-[18px] xl:col-span-5" />
      </div>
    </div>
  );
}
