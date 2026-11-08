import { CubeIcon, TargetIcon } from "@phosphor-icons/react";
import type { Schema } from "@/api/types";
import { Panel, StatusBadge } from "@/components/system";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProteinPanel } from "../protein-viewer/ProteinPanel";

type Target = Schema<"Target">;
type Structure = Schema<"Structure">;

const STRUCTURE_NOTE =
  "Target context only. Not evidence that the drug binds this structure.";

function peakBrain(t: Target) {
  const rows = t.brain_expression ?? [];
  return rows.reduce<(typeof rows)[number] | null>(
    (best, r) => (!best || r.ntpm > best.ntpm ? r : best),
    null,
  );
}

function titleCase(s?: string | null) {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : "unspecified";
}

export function TargetsPanel({
  targets,
  className,
}: {
  targets: Target[];
  className?: string;
}) {
  return (
    <Panel
      title="Targets"
      icon={<TargetIcon />}
      caption={targets.length ? `${targets.length} recorded · ChEMBL` : "ChEMBL"}
      aria-label="Targets"
      className={className}
      flush
    >
      {targets.length ? (
        <div className="max-h-[260px] overflow-auto px-3 pb-3">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-[1] bg-white/85 backdrop-blur">
              <tr className="text-left text-[11.5px] text-ink-3">
                <th scope="col" className="px-4 py-2 font-normal">Symbol</th>
                <th scope="col" className="px-4 py-2 font-normal">Action</th>
                <th scope="col" className="px-4 py-2 text-right font-normal">Brain nTPM</th>
                <th scope="col" className="px-4 py-2 font-normal">Entrez</th>
                <th scope="col" className="px-4 py-2 font-normal">UniProt</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const peak = peakBrain(t);
                return (
                  <tr key={t.entrez_id} className="transition-colors hover:bg-primary/6 [&>*:first-child]:rounded-l-[12px] [&>*:last-child]:rounded-r-[12px]">
                    <th scope="row" className="px-4 py-2 text-left font-mono font-medium text-ink">
                      {t.symbol}
                    </th>
                    <td className="px-4 py-2 text-ink-2">{titleCase(t.action_type)}</td>
                    <td
                      className="px-4 py-2 text-right font-mono tabular-nums text-ink"
                      title={peak ? `Peak: ${peak.context}` : undefined}
                    >
                      {peak ? peak.ntpm.toFixed(1) : "unspecified"}
                    </td>
                    <td className="px-4 py-2 font-mono text-ink-3">{t.entrez_id}</td>
                    <td className="px-4 py-2 font-mono text-ink-3">{t.uniprot}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 px-5 pt-2 pb-5 text-[13px] text-ink-3">No recorded targets</p>
      )}
    </Panel>
  );
}

export function TargetContextBadge({ note }: { note?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<StatusBadge tone="neutral" tabIndex={0} />}>
        target context
      </TooltipTrigger>
      <TooltipContent>{note ?? STRUCTURE_NOTE}</TooltipContent>
    </Tooltip>
  );
}

/** PDB structure for a target. Context for the target, never binding evidence. */
export function StructurePanel({
  structure,
  className,
}: {
  structure: Structure | null | undefined;
  className?: string;
}) {
  return (
    <Panel
      title="Protein structure"
      icon={<CubeIcon />}
      caption="Target context only, not binding evidence"
      aria-label="Protein structure"
      className={className}
      actions={<TargetContextBadge note={structure?.note} />}
    >
      {structure ? (
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <dl className="m-0 grid content-start gap-3 rounded-[12px] bg-white/55 p-4 ring-1 ring-white/80">
            <Meta label="PDB" value={structure.pdb_id} />
            <Meta label="UniProt" value={structure.uniprot} />
            <Meta label="Method" value={structure.method ?? "unspecified"} />
            <Meta
              label="Resolution"
              value={
                structure.resolution_angstrom != null
                  ? `${structure.resolution_angstrom.toFixed(2)} Å`
                  : "unspecified"
              }
            />
          </dl>
          <div className="min-w-0 overflow-hidden rounded-[12px] [&_.tauchstone-molstar]:rounded-[12px] [&_.tauchstone-molstar]:border-0">
            <ProteinPanel url={structure.url} note={null} />
          </div>
        </div>
      ) : (
        <p className="m-0 text-[13px] text-ink-3">No target structure</p>
      )}
    </Panel>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="m-0 font-mono text-[13px] text-ink">{value}</dd>
    </div>
  );
}
