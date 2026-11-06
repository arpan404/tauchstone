import type { Schema } from '@/api/types';
import { verdictLabel } from '@/api/mock/attack';

export type Verdict = Schema<'Verdict'>;

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict; size?: 'sm' | 'md' }) {
  const styles: Record<Verdict, string> = {
    SUPPORTED_SO_FAR: 'bg-teal-50 text-teal-900 border-teal-300',
    FRAGILE_CONTEXT_DEPENDENT: 'bg-amber-50 text-amber-950 border-amber-300',
    INSUFFICIENT_EVIDENCE: 'bg-neutral-100 text-neutral-700 border-neutral-300',
  };
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <span
      role="status"
      aria-label={`Verdict: ${verdictLabel(verdict)}`}
      className={`inline-flex items-center rounded-full border font-medium ${styles[verdict]} ${sizing}`}
    >
      {verdictLabel(verdict)}
    </span>
  );
}

const EXPOSURE_LABELS: Record<Schema<'ExposureLevel'>, string> = {
  measured_human_cns: 'measured human CNS',
  measured_preclinical: 'measured preclinical',
  curated: 'curated',
  predicted: 'predicted',
  none: 'none',
};

export function exposureLabel(level: Schema<'ExposureLevel'>): string {
  return EXPOSURE_LABELS[level];
}

const CONTEXT_ICONS: Record<Schema<'ContextType'>, string> = {
  held_out_cohort: '▣',
  composition_adjusted: '◐',
  lincs_context: '▤',
  brain_exposure: '⬢',
  cell_type: '⬣',
};

export function contextIcon(type: Schema<'ContextType'>): string {
  return CONTEXT_ICONS[type];
}
