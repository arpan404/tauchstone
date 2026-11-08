import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/ui';
import { CompareView } from './CompareView';

const detail = (id: string) => ({ drug_id: id, name: id === 'a' ? 'Piperacillin' : 'Brinzolamide',
  pool_rank: id === 'a' ? 5 : 12, consensus: id === 'a' ? -1.79 : -1.67, n_contexts: 3,
  preregistered: false, attack_ready: true, n_hidden_tests: 3,
  contexts: [{ cell_id: 'MCF7', dose: '10 uM', time: '6 h', consensus: -1.67 }],
  gaps: { brain_cells: [], doses_um: [10], times_h: [6, 24], exposure: { level: 'predicted', label: 'predicted low' }, has_targets: false },
  approval_status: id === 'a'
    ? { status: 'approved', withdrawn: true, withdrawn_year: 1980, withdrawn_class: 'hepatotoxicity', withdrawn_source: 'ChEMBL 37' }
    : { status: 'approved', withdrawn: false },
  targets: id === 'a' ? [] : [{ symbol: 'CA2' }], hidden: { value: 'SECRET_OUTCOME' } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CompareView', () => {
  it('loads 2 compounds in requested order and aligns public gap rows', async () => {
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => detail(url.endsWith('a') ? 'a' : 'b') }));
    vi.stubGlobal('fetch', fetcher);
    render(<CompareView drugIds={['a', 'b']} />);
    await screen.findByText('Brinzolamide');
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/drugs/a', '/api/drugs/b']);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[1].textContent).toContain('Piperacillin');
    expect(headers[2].textContent).toContain('Brinzolamide');
    for (const label of ['Reversal', 'Contexts', 'Cell lines', 'Doses', 'Times', 'Brain-cell data', 'Brain exposure', 'Targets', 'Hidden tests', 'Approval']) {
      expect(screen.getByRole('rowheader', { name: label })).toBeTruthy();
    }
    expect(screen.getByText('-1.79')).toBeTruthy();
    expect(screen.getByText('#5')).toBeTruthy();
    expect(screen.getByText('CA2')).toBeTruthy();
    expect(screen.getAllByText('not preregistered')).toHaveLength(2);
    expect(screen.getAllByText('predicted low')).toHaveLength(2);
    expect(screen.queryByText('SECRET_OUTCOME')).toBeNull();
    expect(screen.getAllByText('withdrawn 1980')).toHaveLength(1);
  });
  it('keeps successful columns when another drug fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: url.endsWith('a'), json: async () => detail('a') })));
    render(<CompareView drugIds={['a', 'b']} />);
    await screen.findByText('Piperacillin');
    expect(screen.getAllByText('Unavailable')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove b' })).toBeTruthy();
    expect(screen.getByText('-1.79')).toBeTruthy();
  });
  it.each([[], ['a'], ['a','b','c','d','e']])('rejects invalid column counts %j', async (...ids) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<CompareView drugIds={ids as string[]} />);
    expect(screen.getByText('Choose 2 to 4 candidates')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose candidates' })).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('supports four columns and encodes project scope', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => detail('b') })); vi.stubGlobal('fetch', fetcher);
    render(<CompareView drugIds={['a', 'b', 'c', 'd']} projectId="project/1" />);
    await waitFor(() => expect(screen.getAllByText('Brinzolamide')).toHaveLength(4));
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    expect(fetcher.mock.calls).toHaveLength(4);
  });
  it('replaces old data when selected drugs change', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => detail(url.endsWith('a') ? 'a' : 'b') })));
    const view = render(<CompareView drugIds={['a', 'b']} />);
    await screen.findByText('Piperacillin');
    view.rerender(<CompareView drugIds={['c', 'd']} />);
    await waitFor(() => expect(screen.queryByText('Piperacillin')).toBeNull());
    const row = screen.getByRole('rowheader', { name: 'Targets' }).closest('tr')!;
    await waitFor(() => expect(within(row).getAllByText('CA2')).toHaveLength(2));
  });
  it('removes a column from compare and emphasises the strongest reversal', async () => {
    useUi.setState({ compareIds: ['a', 'b'] });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => detail(url.endsWith('a') ? 'a' : 'b') })));
    render(<CompareView drugIds={['a', 'b']} />);
    await screen.findByText('Brinzolamide');
    expect(screen.getByText('-1.79').className).toContain('text-primary');
    expect(screen.getByText('-1.67').className).not.toContain('text-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Piperacillin' }));
    expect(useUi.getState().compareIds).toEqual(['b']);
  });
  it('sends Choose candidates back to the Candidates step', () => {
    useUi.setState({ step: 'compare' });
    render(<CompareView drugIds={['a']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose candidates' }));
    expect(useUi.getState().step).toBe('candidates');
  });
});
