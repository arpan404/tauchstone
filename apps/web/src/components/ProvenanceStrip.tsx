import type { Schema } from '@/api/schema';

function shortHash(s: string): string {
  return s.length > 14 ? `${s.slice(0, 10)}…` : s;
}

export function ProvenanceStrip({ provenance }: { provenance?: Schema<'Provenance'> | null }) {
  if (!provenance) return null;
  const accession = Array.isArray(provenance.dataset_accession)
    ? provenance.dataset_accession.join(', ')
    : provenance.dataset_accession;
  return (
    <footer
      aria-label="Data provenance"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-200 bg-neutral-50 px-4 py-2 font-mono text-[11px] text-neutral-500 tabular-nums"
    >
      <span>
        dataset <span className="text-neutral-700">{accession}</span>
      </span>
      <span>
        commit <span className="text-neutral-700">{shortHash(provenance.git_commit)}</span>
      </span>
      {provenance.random_seed !== undefined && provenance.random_seed !== null && (
        <span>
          seed <span className="text-neutral-700">{provenance.random_seed}</span>
        </span>
      )}
      <span>
        processed <span className="text-neutral-700">{provenance.processing_version}</span>
      </span>
    </footer>
  );
}
