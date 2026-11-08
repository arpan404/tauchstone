import type { ReactNode } from "react";
import { InfoIcon, KeyIcon, UsersThreeIcon, WarningIcon } from "@phosphor-icons/react";
import type { useDrugResources } from "@/api/mvpHooks";
import type { Schema } from "@/api/types";
import { Panel, StatusBadge } from "@/components/system";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { int } from "./format";
import { sourcesDisagree } from "./agreement";

type Resource = Schema<"ResourceAgreement">;

const NAMES: Record<Resource["resource"], string> = {
  tauchstone_lincs_gold: "Our LINCS ranking",
  perturb_seqr: "Perturb-Seqr",
  clue: "CLUE",
};
const ORDER: Resource["resource"][] = ["tauchstone_lincs_gold", "perturb_seqr", "clue"];
const STATUS: Record<Resource["status"], string> = {
  available: "available",
  not_found: "not found",
  not_fetched: "not fetched",
  not_available: "not available",
  needs_key: "needs key",
};

/** Drops the shared "not preregistered; report-only." prefix; the panel badge already says it. */
function noteText(note?: string | null) {
  return note?.replace(/^not preregistered;\s*report-only\.\s*/i, "").trim() || null;
}

/** Rank of the drug in each resource. Children (the evidence gaps) render under the rows. */
export function ResourceAgreement({
  resources,
  className,
  children,
}: {
  resources: ReturnType<typeof useDrugResources>;
  className?: string;
  children?: ReactNode;
}) {
  const rows = [...(resources.data ?? [])].sort(
    (a, b) => ORDER.indexOf(a.resource) - ORDER.indexOf(b.resource),
  );
  const disagree = sourcesDisagree(rows);
  return (
    <Panel
      title="Rank in other resources"
      icon={<UsersThreeIcon />}
      caption="Left is the top of each list"
      aria-label="Agreement across resources"
      className={className}
    >
      <div className="-mt-1 mb-4 flex flex-wrap items-center gap-1.5">
          {disagree && (
            <Tooltip>
              <TooltipTrigger render={<StatusBadge tone="gap" tabIndex={0} />}>
                <WarningIcon />
                Sources disagree
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-left leading-snug">
                {`Our LINCS rank ${int(disagree.lincs.rank!)} / ${int(disagree.lincs.n_ranked!)}. Perturb-Seqr rank ${int(disagree.seqr.rank!)} / ${int(disagree.seqr.n_ranked!)}. They test different sets of drugs in different ways, so disagreement is common.`}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger render={<StatusBadge tone="neutral" tabIndex={0} />}>
              Report only
            </TooltipTrigger>
            <TooltipContent>Shown for comparison only. These outside databases are not part of the main study and never change our ranking.</TooltipContent>
          </Tooltip>
        </div>
      {resources.isPending && (
        <div role="status" aria-label="Loading resources" className="space-y-4">
          <Skeleton className="h-9 rounded-[12px]" />
          <Skeleton className="h-9 rounded-[12px]" />
          <Skeleton className="h-9 rounded-[12px]" />
        </div>
      )}
      {resources.isError && (
        <div role="alert" className="flex items-center gap-3 text-[13px] text-ink-2">
          Could not load resources
          <Button variant="outline" onClick={() => void resources.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Rank of this drug in each resource">
          {rows.map((r) => (
            <ResourceRow key={r.resource} resource={r} />
          ))}
        </ul>
      )}
      {children && <div className="mt-5 border-t border-ink/[0.06] pt-4">{children}</div>}
    </Panel>
  );
}

function ResourceRow({ resource: r }: { resource: Resource }) {
  const note = noteText(r.note);
  const ranked = r.status === "available" && r.rank != null;
  return (
    <li className="min-w-0">
      <div className="flex min-h-7 items-center justify-between gap-3 text-[13px]">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
          {NAMES[r.resource]}
          {note && (
            <Tooltip>
              <TooltipTrigger
                aria-label={`${NAMES[r.resource]} note`}
                className="rounded-full text-ink-3 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <InfoIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{note}</TooltipContent>
            </Tooltip>
          )}
        </span>
        {ranked ? (
          <span className="font-mono text-[12.5px] whitespace-nowrap text-ink tabular-nums">
            {`rank ${int(r.rank!)}${r.n_ranked != null ? ` / ${int(r.n_ranked)}` : ""}`}
          </span>
        ) : r.status === "needs_key" ? (
          <ClueKeyDialog />
        ) : (
          <StatusBadge size="sm">{STATUS[r.status]}</StatusBadge>
        )}
      </div>
      <div className="mt-1.5">
        {ranked && r.n_ranked ? (
          <RankTrack rank={r.rank!} total={r.n_ranked} />
        ) : (
          <span className="block h-2 rounded-full bg-ink/[0.035]" aria-hidden />
        )}
      </div>
    </li>
  );
}

/** Where the rank sits in its resource's list; left is the top of the list. */
function RankTrack({ rank, total }: { rank: number; total: number }) {
  const at = Math.min(1, Math.max(0, (rank - 1) / Math.max(1, total - 1)));
  return (
    <span
      className="relative mx-1.5 block h-2 rounded-full bg-gradient-to-r from-primary/30 via-primary/10 to-ink/[0.04]"
      aria-hidden
    >
      <span
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-[2.5px] ring-rim"
        style={{ left: `${at * 100}%` }}
      />
    </span>
  );
}

function ClueKeyDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" className="rounded-full" />}>
        <KeyIcon /> Add API key
      </DialogTrigger>
      <DialogContent className="shadow-overlay">
        <DialogHeader>
          <DialogTitle>CLUE API key</DialogTitle>
        </DialogHeader>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink-3">Set by</dt>
          <dd className="m-0 text-ink">Workspace administrator</dd>
          <dt className="text-ink-3">Variable</dt>
          <dd className="m-0 font-mono text-ink">TS_CLUE_API_KEY</dd>
        </dl>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
