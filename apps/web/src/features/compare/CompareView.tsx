import { useEffect, useState } from 'react';
import type { Schema } from '../../api/types';
import '../report/report.css';

type Detail = Schema<'DrugDetail'>;
type Entry = { id: string; detail?: Detail; error?: boolean };
export interface CompareViewProps { drugIds: string[]; projectId?: string }
const unspecified = 'unspecified';
const list = (values: (string | number)[] | undefined, unit = '') => values?.length ? values.map(v => `${v}${unit}`).join(' · ') : unspecified;

export function CompareView({ drugIds, projectId }: CompareViewProps) {
  const ids = [...new Set(drugIds)];
  const valid = ids.length >= 2 && ids.length <= 4;
  const key = JSON.stringify([ids, projectId]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (valid) {
      const [selected] = JSON.parse(key) as [string[], string | undefined];
      Promise.all(selected.map(async id => {
        try {
          const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
          const response = await fetch(`/api/drugs/${encodeURIComponent(id)}${query}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Drug unavailable');
          return { id, detail: await response.json() as Detail };
        } catch { return { id, error: true }; }
      })).then(values => { if (!controller.signal.aborted) { setEntries(values); setLoadedKey(key); } });
    }
    return () => controller.abort();
  }, [key, valid, projectId]);
  if (!valid) return <section className="ts-compare-view"><h1>Compare</h1><p role="status">Select 2–4 compounds</p><Boundary /></section>;
  const visible = loadedKey === key ? entries : ids.map(id => ({ id } as Entry));
  const rows: { label: string; value: (d: Detail) => React.ReactNode }[] = [
    { label: 'Pool rank', value: d => <span className="ts-compare-number">{d.pool_rank ?? unspecified}</span> },
    { label: 'Reversal', value: d => <span className="ts-compare-number">{d.consensus.toFixed(2)}</span> },
    { label: 'Cell lines', value: d => list([...new Set(d.contexts.map(c => c.cell_id))]) },
    { label: 'Concentrations', value: d => list(d.gaps.doses_um, ' µM') },
    { label: 'Time', value: d => list(d.gaps.times_h, ' h') },
    { label: 'Brain exposure', value: d => <span className="ts-compare-chip ts-compare-gap">{d.gaps.exposure.label.startsWith(d.gaps.exposure.level) ? d.gaps.exposure.label : `${d.gaps.exposure.level} ${d.gaps.exposure.label || unspecified}`} </span> },
    { label: 'Targets', value: d => d.targets?.length ? list(d.targets.map(t => t.symbol)) : 'None recorded' },
    { label: 'Attack', value: d => <><span>{d.n_hidden_tests ?? unspecified} hidden tests</span><br /><span>{d.attack_ready ? 'Ready' : 'Not available'}</span></> },
  ];
  return <section className="ts-compare-view" aria-label="Compare compounds">
    <div className="ts-report-toolbar"><h1>Compare</h1><span>{ids.length} compounds</span></div>
    <div className="ts-compare-scroll" tabIndex={0} aria-label="Scroll compound comparison"><table className="ts-compare-table"><caption className="ts-compare-caption">Compound evidence and gaps</caption><thead><tr><th scope="col">Evidence</th>{visible.map(entry => <th scope="col" key={entry.id}>{entry.detail?.name ?? entry.id}{entry.detail && !entry.detail.preregistered && <><br /><span className="ts-compare-chip ts-compare-gap">not preregistered</span></>}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{visible.map(entry => <td key={entry.id}>{entry.error ? <span role="status">Unavailable</span> : entry.detail ? row.value(entry.detail) : <span role="status">Loading…</span>}</td>)}</tr>)}</tbody></table></div><Boundary />
  </section>;
}
function Boundary() { return <footer className="ts-report-boundary">Research hypothesis only. Not a treatment recommendation. A structure is target context, never binding evidence.</footer>; }
export default CompareView;
