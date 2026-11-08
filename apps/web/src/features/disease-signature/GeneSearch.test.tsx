import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GeneMatchTable, GeneSearch, focusGene, matchGenes } from './GeneSearch';
import type { Schema } from '@/api/types';
afterEach(cleanup);

const genes: Schema<'GeneStat'>[] = [
  { symbol: 'GFAP', entrez_id: '2670', log2fc: 1.2, stat: 3, p_value: 0.001, fdr: 0.01 },
  { symbol: 'GFAPX', entrez_id: '99', log2fc: -0.2, stat: -1, p_value: 0.2, fdr: 0.4 },
];

function Harness() {
  const [q, setQ] = useState('');
  const matches = matchGenes(genes, q);
  const focus = focusGene(matches, q);
  return (
    <>
      <GeneSearch value={q} onChange={setQ} count={matches.length} picks={['SST']} />
      {matches.length > 0 && <GeneMatchTable matches={matches} focusId={focus?.entrez_id ?? null} onFocus={() => {}} />}
    </>
  );
}

it('searches symbols case insensitively and Entrez identifiers without changing the signature', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Inspect a gene');
  fireEvent.change(input, { target: { value: 'gfap' } });
  const table = screen.getByRole('table', { name: 'Matching signature genes' });
  expect(within(table).getByText('GFAP')).toBeTruthy();
  fireEvent.change(input, { target: { value: '2670' } });
  expect(within(screen.getByRole('table')).getByText('GFAP')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.getByRole('status').textContent).toBe('0 matching genes');
  expect(genes[0]?.log2fc).toBe(1.2);
});

it('puts the exact symbol first and focuses it', () => {
  const matches = matchGenes(genes, 'gfap');
  expect(matches.map((g) => g.symbol)).toEqual(['GFAP', 'GFAPX']);
  expect(focusGene(matches, 'gfap')?.entrez_id).toBe('2670');
  expect(focusGene(matchGenes(genes, 'gf'), 'gf')).toBeNull();
});

it('offers quick picks only while the field is empty', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'SST' }));
  expect((screen.getByLabelText('Inspect a gene') as HTMLInputElement).value).toBe('SST');
  expect(screen.queryByRole('button', { name: 'SST' })).toBeNull();
});
