import { InfoIcon, KeyIcon } from "@phosphor-icons/react";
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
  tauchstone_lincs_gold: "LINCS gold",
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

export function ResourceAgreement({
  resources,
  className,
}: {
  resources: ReturnType<typeof useDrugResources>;
  className?: string;
}) {
  const rows = [...(resources.data ?? [])].sort(
    (a, b) => ORDER.indexOf(a.resource) - ORDER.indexOf(b.resource),
  );
  const disagree = sourcesDisagree(rows);
  return (
    <Panel
      title="Resource agreement"
      aria-label="Agreement across resources"
      className={className}
      flush
      actions={
        <span className="flex items-center gap-1.5">
          {disagree && (
            <Tooltip>
              <TooltipTrigger render={<StatusBadge tone="gap" tabIndex={0} />}>
                Sources disagree
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-left leading-snug">
                {`LINCS gold rank ${int(disagree.lincs.rank!)} / ${int(disagree.lincs.n_ranked!)}. Perturb-Seqr rank ${int(disagree.seqr.rank!)} / ${int(disagree.seqr.n_ranked!)}. The resources use different compound libraries and assays.`}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger render={<StatusBadge tone="neutral" tabIndex={0} />}>
              Report only
            </TooltipTrigger>
            <TooltipContent>Not preregistered. Not used for ranking.</TooltipContent>
          </Tooltip>
        </span>
      }
    >
      {resources.isPending && (
        <div role="status" aria-label="Loading resources" className="space-y-2 p-4">
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
        </div>
      )}
      {resources.isError && (
        <div role="alert" className="flex items-center gap-3 p-4 text-[13px] text-ink-2">
          Resources unavailable
          <Button size="sm" variant="outline" onClick={() => void resources.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {rows.length > 0 && (
        <table className="w-full text-[13px]">
          <caption className="sr-only">Rank of this drug in each resource</caption>
          <tbody>
            {rows.map((r) => (
              <ResourceRow key={r.resource} resource={r} />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function ResourceRow({ resource: r }: { resource: Resource }) {
  const note = noteText(r.note);
  const ranked = r.status === "available" && r.rank != null;
  return (
    <tr className="border-t border-line first:border-t-0">
      <th scope="row" className="px-4 py-2.5 text-left font-medium text-ink">
        <span className="flex items-center gap-1.5">
          {NAMES[r.resource]}
          {note && (
            <Tooltip>
              <TooltipTrigger
                aria-label={`${NAMES[r.resource]} note`}
                className="rounded-sm text-ink-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <InfoIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{note}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </th>
      <td className="px-4 py-2.5">
        {ranked ? (
          <span className="font-mono text-[13px] tabular-nums text-ink">
            rank {int(r.rank!)}
            {r.n_ranked != null ? ` / ${int(r.n_ranked)}` : ""}
          </span>
        ) : r.status === "needs_key" ? (
          <ClueKeyDialog />
        ) : (
          <StatusBadge>{STATUS[r.status]}</StatusBadge>
        )}
      </td>
      <td className="px-4 py-2.5">
        {ranked && r.n_ranked ? <RankTrack rank={r.rank!} total={r.n_ranked} /> : null}
      </td>
    </tr>
  );
}

/** Where the rank sits in its resource's list; left is the top of the list. */
function RankTrack({ rank, total }: { rank: number; total: number }) {
  const at = Math.min(1, Math.max(0, (rank - 1) / Math.max(1, total - 1)));
  return (
    <span className="relative block h-1.5 w-20 rounded-full bg-surface-2" aria-hidden>
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary"
        style={{ left: `${at * 100}%` }}
      />
    </span>
  );
}

function ClueKeyDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
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
