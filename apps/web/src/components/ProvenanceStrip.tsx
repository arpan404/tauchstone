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
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card px-5 py-2 text-[10px] text-muted-foreground md:px-7"
    >
      <span>
        Dataset <span className="text-foreground/75">{accession}</span>
      </span>
      <span>
        Commit <span className="font-mono text-foreground/75">{shortHash(provenance.git_commit)}</span>
      </span>
      {provenance.random_seed !== undefined && provenance.random_seed !== null && (
        <span>
          Seed <span className="font-mono text-foreground/75">{provenance.random_seed}</span>
        </span>
      )}
      <span>
        Processed <span className="text-foreground/75">{provenance.processing_version}</span>
      </span>
    </footer>
  );
}
