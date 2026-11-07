import { describe, expect, it } from 'vitest';
import { gapsToChips } from './useDrugGaps';
import type { Schema } from '@/api/types';

const base: Schema<'DrugDetail'>['gaps'] = {
  brain_cells: [],
  cancer_lines_only: true,
  doses_um: [10],
  times_h: [6],
  exposure: { level: 'predicted', label: 'predicted low' },
  has_targets: false,
};

describe('gapsToChips', () => {
  it('maps the Piperacillin-style gap set to mockup chips', () => {
    expect(gapsToChips(base).map((c) => c.text)).toEqual([
      'Cancer lines only',
      'No brain-cell data',
      '10 µM only',
      '6 h only',
      'Brain exposure · predicted low',
      'No recorded targets',
    ]);
  });
  it('marks measured exposure ok and skips settled dimensions', () => {
    const chips = gapsToChips({
      ...base,
      brain_cells: [{ cell_id: 'NEU', consensus: -0.66, below_theta: true }],
      cancer_lines_only: false,
      doses_um: [0.04, 10],
      times_h: [6, 24],
      exposure: { level: 'measured_human_cns', label: 'measured' },
      has_targets: true,
    });
    expect(chips.map((c) => c.text)).toEqual(['Brain exposure · measured']);
    expect(chips[0].tone).toBe('ok');
  });
});
