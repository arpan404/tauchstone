import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { isMockMode } from '@/api/mock';
import type { Schema } from '@/api/types';

type Gaps = Schema<'DrugDetail'>['gaps'];

export interface GapChip {
  text: string;
  tone: 'bad' | 'gap' | 'ok' | 'neutral';
}

/** Turn per-drug evidence gaps into chips. Labels only, no held-out data. */
export function gapsToChips(gaps: Gaps): GapChip[] {
  const chips: GapChip[] = [];
  if (gaps.cancer_lines_only) chips.push({ text: 'Cancer lines only', tone: 'bad' });
  if (gaps.brain_cells.length === 0) chips.push({ text: 'No brain-cell data', tone: 'bad' });
  if (gaps.doses_um.length === 1) chips.push({ text: `${gaps.doses_um[0]} µM only`, tone: 'gap' });
  if (gaps.times_h.length === 1) chips.push({ text: `${gaps.times_h[0]} h only`, tone: 'gap' });
  const label = gaps.exposure.label.toLowerCase();
  const tone: GapChip['tone'] =
    gaps.exposure.level === 'none' || label.includes('low') || label.includes('none')
      ? 'bad'
      : label.includes('measured')
        ? 'ok'
        : 'gap';
  chips.push({ text: `Brain exposure · ${gaps.exposure.label}`, tone });
  if (!gaps.has_targets) chips.push({ text: 'No recorded targets', tone: 'gap' });
  return chips;
}

/**
 * Load open gaps from GET /drugs/{id}. Returns null when unavailable
 * (mock mode, unknown drug, server without the route): the section hides.
 */
export function useDrugGaps(candidateId: string | null): GapChip[] | null {
  const [chips, setChips] = useState<GapChip[] | null>(null);
  useEffect(() => {
    setChips(null);
    if (!candidateId || isMockMode()) return;
    let live = true;
    api<Schema<'DrugDetail'>>(`/drugs/${encodeURIComponent(candidateId)}`)
      .then((drug) => {
        if (live) setChips(gapsToChips(drug.gaps));
      })
      .catch(() => {
        if (live) setChips(null);
      });
    return () => {
      live = false;
    };
  }, [candidateId]);
  return chips;
}
