import type { Schema } from '@/api/types';

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
      className="mx-6 mb-6 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-3"
    >
      <span>
        Dataset <span className="text-ink-2">{accession}</span>
      </span>
      <span>
        Commit <span className="font-mono text-ink-2">{shortHash(provenance.git_commit)}</span>
      </span>
      {provenance.random_seed !== undefined && provenance.random_seed !== null && (
        <span>
          Seed <span className="font-mono text-ink-2">{provenance.random_seed}</span>
        </span>
      )}
      <span>
        Processed <span className="text-ink-2">{provenance.processing_version}</span>
      </span>
    </footer>
  );
}
