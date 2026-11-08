import type { ReactNode } from 'react';
import type { Schema } from '@/api/types';

const short = (s: string) => (s.length > 12 ? s.slice(0, 10) : s);

/** Quiet provenance line at the foot of the page: no box, no rule. */
export function ProvenanceFooter({ provenance, extra }: { provenance?: Schema<'Provenance'> | null; extra?: ReactNode }) {
  if (!provenance) return null;
  const dataset = Array.isArray(provenance.dataset_accession)
    ? provenance.dataset_accession.join(', ')
    : provenance.dataset_accession;
  const items: [string, ReactNode][] = [
    ['Dataset', dataset],
    ['Commit', <span key="c" className="font-mono" title={provenance.git_commit}>{short(provenance.git_commit)}</span>],
    ...(provenance.random_seed != null ? ([['Seed', <span key="s" className="font-mono">{provenance.random_seed}</span>]] as [string, ReactNode][]) : []),
    ['Processed', provenance.processing_version],
  ];
  return (
    <footer aria-label="Data provenance" className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 pt-1 pb-2 text-[11.5px] text-ink-3">
      {items.map(([k, v]) => (
        <span key={k} className="min-w-0 break-words">
          {k} <span className="text-ink-2">{v}</span>
        </span>
      ))}
      {extra}
    </footer>
  );
}
