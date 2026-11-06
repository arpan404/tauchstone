import type { Schema } from '@/api/types';
import { verdictLabel } from '@/api/mock/attack';
import { Badge } from '@/components/ui/badge';

export type Verdict = Schema<'Verdict'>;

export function VerdictBadge({ verdict, size = 'md' }: { verdict: Verdict; size?: 'sm' | 'md' }) {
  const styles: Record<Verdict, string> = {
    SUPPORTED_SO_FAR: 'bg-[var(--success-surface)] text-[var(--success)] border-transparent',
    FRAGILE_CONTEXT_DEPENDENT: 'bg-[var(--warning-surface)] text-[var(--warning)] border-transparent',
    INSUFFICIENT_EVIDENCE: 'bg-secondary text-secondary-foreground border-transparent',
  };
  const sizing = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  return (
    <Badge
      role="status"
      aria-label={`Verdict: ${verdictLabel(verdict)}`}
      className={`rounded-md font-medium ${styles[verdict]} ${sizing}`}
    >
      {verdictLabel(verdict)}
    </Badge>
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
