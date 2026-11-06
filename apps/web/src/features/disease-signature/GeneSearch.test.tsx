import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GeneSearch } from './GeneSearch';
import type { Schema } from '@/api/types';
afterEach(cleanup);
it('searches symbols case insensitively and Entrez identifiers without changing the signature', () => {
  const genes: Schema<'GeneStat'>[] = [{ symbol: 'GFAP', entrez_id: '2670', log2fc: 1.2, stat: 3, p_value: 0.001, fdr: 0.01 }];
  render(<GeneSearch genes={genes} />);
  const input = screen.getByLabelText('Inspect a gene');
  fireEvent.change(input, { target: { value: 'gfap' } });
  expect(screen.getByText('GFAP')).toBeTruthy();
  fireEvent.change(input, { target: { value: '2670' } });
  expect(screen.getByText('GFAP')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.getByRole('status').textContent).toBe('0 matching genes');
  expect(genes[0]?.log2fc).toBe(1.2);
});
