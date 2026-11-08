import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { attackSessionKey } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { ReportView } from './ReportView';
beforeEach(() => { useUi.setState({ sessionId: null }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(ui: React.ReactElement, client = new QueryClient()) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
it('fetches scoped HTML and exposes PDF and print links', async () => {
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, text: async () => '<h1>Report</h1>' }));
  vi.stubGlobal('fetch', fetcher);
  setup(<ReportView drugId="BRD/a" projectId="project 1" />);
  expect(screen.getByText('Print HTML').getAttribute('href')).toBe('/api/reports/BRD%2Fa?project_id=project%201');
  const frame = await screen.findByTitle('Drug evidence report');
  expect(frame.getAttribute('sandbox')).toBe('allow-modals');
  expect(frame.getAttribute('srcdoc')).toContain('<h1>Report</h1>');
  expect(screen.getByText('Download PDF').getAttribute('href')).toBe('/api/reports/BRD%2Fa.pdf?project_id=project%201');
  expect(fetcher.mock.calls[0][0]).toBe('/api/reports/BRD%2Fa?project_id=project%201');
});
it('adds the Attack session only when it is on this drug', async () => {
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, text: async () => '<h1>Report</h1>' }));
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient();
  client.setQueryData(attackSessionKey('s1'), { session_id: 's1', candidate_id: 'BRD-1' });
  useUi.setState({ sessionId: 's1' });
  setup(<ReportView drugId="BRD-1" />, client);
  expect(screen.getByText('Download PDF').getAttribute('href')).toBe('/api/reports/BRD-1.pdf?session_id=s1');
  await screen.findByTitle('Drug evidence report');
  expect(fetcher.mock.calls[0][0]).toBe('/api/reports/BRD-1?session_id=s1');
  cleanup();
  setup(<ReportView drugId="BRD-2" />, client);
  expect(screen.getByText('Download PDF').getAttribute('href')).toBe('/api/reports/BRD-2.pdf');
});
it('shows a report error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  setup(<ReportView drugId="missing" />);
  expect((await screen.findByRole('alert')).textContent).toBe('Report unavailable');
});
