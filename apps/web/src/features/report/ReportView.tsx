import { useEffect, useState } from 'react';
import './report.css';

export interface ReportViewProps { drugId: string; projectId?: string }

export function ReportView({ drugId, projectId }: ReportViewProps) {
  const [result, setResult] = useState<{ key: string; html: string; error: boolean } | null>(null);
  const url = `/api/reports/${encodeURIComponent(drugId)}`;
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  const key = url + query;
  const html = result?.key === key ? result.html : '';
  const error = result?.key === key && result.error;
  const loading = result?.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    fetch(key, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Report unavailable'); return response.text(); })
      .then(value => { if (!controller.signal.aborted) { setResult({ key, html: value, error: false }); } })
      .catch(() => { if (!controller.signal.aborted) { setResult({ key, html: '', error: true }); } });
    return () => controller.abort();
  }, [key]);
  return <section className="ts-report-view" aria-label="Drug report">
    <div className="ts-report-toolbar"><div className="ts-report-actions"><a className="ts-report-action ts-report-action-secondary" href={`${url}${query}`} target="_blank" rel="noreferrer">Print HTML</a><a className="ts-report-action" href={`${url}.pdf${query}`} target="_blank" rel="noreferrer">Download PDF</a></div></div>
    {loading && <p role="status">Loading report…</p>}
    {error && <p role="alert">Report unavailable</p>}
    {html && <iframe className="ts-report-frame" title="Drug evidence report" srcDoc={html} sandbox="allow-modals" />}
  </section>;
}
export default ReportView;
