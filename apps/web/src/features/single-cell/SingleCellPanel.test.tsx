import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SingleCellPanel } from './SingleCellPanel';
import { getSingleCellMock } from './mock';
import { cellOf, columnGroups, notScored, ordered } from './heatmap';
vi.mock('@/api/mock', () => ({ isMockMode: () => false }));
vi.mock('@/api/hooks', () => ({ useMockStatus: () => false }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <SingleCellPanel />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
it('renders the note, says Exploratory once and flags synthetic provenance even outside mock mode', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => getSingleCellMock() }));
  mount();
  expect(await screen.findByText(getSingleCellMock().note!)).toBeTruthy();
  expect(screen.getAllByText('Exploratory')).toHaveLength(1);
  expect(screen.getByText('Synthetic data')).toBeTruthy();
  expect(screen.getAllByText(notScored).length).toBeGreaterThan(0);
});
it('labels GSE accessions as Dataset in the signature table', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => getSingleCellMock() }));
  mount();
  const table = await screen.findByRole('table', { name: 'Signatures used' });
  expect(within(table).getByRole('columnheader', { name: 'Dataset' })).toBeTruthy();
  expect(within(table).queryByRole('columnheader', { name: 'Cohort' })).toBeNull();
});
it('focuses a drug row and shows its numbers in the side readout', async () => {
  const data = getSingleCellMock();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  mount();
  const second = ordered(data).drugs[1]!;
  const heatmap = await screen.findByRole('group', { name: /Reversal score heatmap/ });
  fireEvent.click(within(heatmap).getByRole('button', { name: `${second.name}, rank ${second.pool_rank}` }));
  const readout = screen.getByRole('region', { name: 'Focused drug or cell type' });
  expect(within(readout).getByRole('heading', { name: second.name })).toBeTruthy();
});
it('never draws an unscored signature as a zero score', () => {
  const data = getSingleCellMock();
  const { drugs, signatures } = ordered(data);
  const unscored = signatures.filter((s) => s.status === 'insufficient_donors');
  expect(unscored.length).toBeGreaterThan(0);
  for (const d of drugs) for (const s of unscored) expect(cellOf(d, s)).toEqual({ kind: 'unscored', reason: notScored });
  expect(columnGroups(signatures).reduce((n, g) => n + g.signatures.length, 0)).toBe(signatures.length);
});
it('handles 404 without substituting fixture results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  mount();
  expect(await screen.findByText('Panel not built yet')).toBeTruthy();
  expect(screen.queryByRole('group', { name: /Reversal score heatmap/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
});
it('handles empty responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...getSingleCellMock(), signatures: [], drugs: [] }) }));
  mount();
  expect(await screen.findByText('No cell-type scores available.')).toBeTruthy();
});
