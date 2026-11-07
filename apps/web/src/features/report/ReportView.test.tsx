import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportView } from './ReportView';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('fetches scoped HTML and exposes PDF and print links', async () => {
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, text: async () => '<h1>Report</h1>' }));
  vi.stubGlobal('fetch', fetcher);
  render(<ReportView drugId="BRD/a" projectId="project 1" />);
  expect(screen.getByText('Print HTML').getAttribute('href')).toBe('/api/reports/BRD%2Fa?project_id=project%201');
  const frame = await screen.findByTitle('Drug evidence report');
  expect(frame.getAttribute('sandbox')).toBe('allow-modals');
  expect(frame.getAttribute('srcdoc')).toContain('<h1>Report</h1>');
  expect(screen.getByText('Download PDF').getAttribute('href')).toBe('/api/reports/BRD%2Fa.pdf?project_id=project%201');
  expect(fetcher.mock.calls[0][0]).toBe('/api/reports/BRD%2Fa?project_id=project%201');
});
it('shows a report error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  render(<ReportView drugId="missing" />);
  expect((await screen.findByRole('alert')).textContent).toBe('Report unavailable');
});
