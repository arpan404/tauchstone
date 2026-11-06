import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SingleCellPanel } from './SingleCellPanel';
import { getSingleCellMock } from './mock';
import { heatmapOption, notScored } from './heatmap';
vi.mock('@/components/InstrumentChart', () => ({ InstrumentChart: () => <div>Heatmap</div> }));
vi.mock('@/api/mock', () => ({ isMockMode: () => false }));
vi.mock('@/api/hooks', () => ({ useMockStatus: () => false }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SingleCellPanel /></QueryClientProvider>); }
it('renders API label and flags synthetic provenance even outside mock mode', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => getSingleCellMock() }));
  mount();
  expect(await screen.findByText(getSingleCellMock().note!)).toBeTruthy();
  expect(screen.getByText(getSingleCellMock().label)).toBeTruthy();
  expect(screen.getByText('Mock data: not real results')).toBeTruthy();
  expect(screen.getAllByText(notScored).length).toBeGreaterThan(0);
});
it('draws null scores with grey hatching rather than a zero score', () => {
  const option = heatmapOption(getSingleCellMock(), { teal: 'teal', warm: 'orange', surface: 'black', muted: 'grey' });
  const cells = option.series[0]!.data.filter(p => 'itemStyle' in p);
  expect(cells).toHaveLength(120);
  expect(cells.every(p => 'itemStyle' in p && p.itemStyle?.color === 'grey' && p.itemStyle?.decal)).toBe(true);
});
it('handles 404 without substituting fixture results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  mount();
  expect(await screen.findByText('Panel not built yet')).toBeTruthy();
  expect(screen.queryByText('Heatmap')).toBeNull();
});
it('handles empty responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...getSingleCellMock(), signatures: [], drugs: [] }) }));
  mount();
  expect(await screen.findByText('No cell-type scores available.')).toBeTruthy();
});
