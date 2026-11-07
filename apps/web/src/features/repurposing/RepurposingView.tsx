import { useState } from 'react';
import { useProjectCandidates, type CandidateFilters } from '@/api/mvpHooks';
import { useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { useUi } from '@/store/ui';
import './mvp.css';

const filters: [keyof CandidateFilters, string][] = [['approved', 'Approved'], ['brain_cells', 'Brain-cell data'], ['penetrant', 'Brain-penetrant'], ['min_contexts', '≥ 5 contexts']];
export function RepurposingView({ projectId = 'GSE132903' }: { projectId?: string } = {}) {
  const [active, setActive] = useState<CandidateFilters>({});
  const [compared, setCompared] = useState<string[]>([]);
  const { data, isPending, isError, refetch } = useProjectCandidates(projectId, active);
  const mock = useMockStatus();
  const { selectCandidate, setStep } = useUi();
  function open(id: string) { selectCandidate(id); setStep('evidence'); }
  return <div className="mvp-view"><BoundaryBanner /><MockRibbon show={mock} /><div className="mvp-body">
    <h2>Candidates</h2><div className="mvp-filters">{filters.map(([key, label]) => <button key={key} className="mvp-filter" aria-pressed={active[key] !== undefined} onClick={() => setActive(current => { const next = { ...current }; if (next[key] !== undefined) delete next[key]; else if (key === 'min_contexts') next.min_contexts = 5; else if (key !== 'limit') next[key] = true; return next; })}>{label}</button>)}<span role="status" className="mvp-count">{data ? `${data.candidates.length} of ${data.n_ranked.toLocaleString('en-US')}` : '…'}</span>{compared.length > 0 && <span className="mvp-chip ac">Compare {compared.length}</span>}</div>
    {data && !data.preregistered && <div className="mvp-chips" style={{ marginBottom: 12 }}><span className="mvp-chip warm">not preregistered</span></div>}
    {isPending && <div role="status" className="mvp-state">Loading candidates…</div>}
    {isError && <div role="alert" className="mvp-state">Candidates unavailable <button className="mvp-btn" onClick={() => void refetch()}>Retry</button></div>}
    {data && <div className="mvp-card mvp-scroll"><table className="mvp-table" aria-label="Candidates"><thead><tr>{['Compare', '#', 'Drug', 'Reversal', 'Score', 'Contexts', 'Brain cells', 'Exposure', 'Status'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{data.candidates.map(c => <tr key={c.id} data-clickable onClick={() => open(c.id)}>
      <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Compare ${c.name}`} checked={compared.includes(c.id)} onChange={() => setCompared(ids => ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id])} /></td><td className="mvp-muted">{c.rank}</td><td><button className="mvp-link" onClick={e => { e.stopPropagation(); open(c.id); }}>{c.name}</button>{c.preregistered === false && <span className="mvp-chip warm" style={{ marginLeft: 6 }}>not preregistered</span>}</td>
      <td><div className="mvp-bar" aria-label={`Reversal ${c.consensus.toFixed(2)}`}><i style={{ width: `${Math.min(100, Math.max(0, -c.consensus / 2.5 * 100))}%` }} /></div></td><td className="mvp-score">{c.consensus.toFixed(2)}</td><td>{c.n_ranking_contexts}</td><td>{c.brain_cells ? <span className="mvp-chip ok">{c.by_cell_line.filter(cell => /^(NEU|SHSY5Y|MNEU|NPC|FIBRNPC)/.test(cell.cell_id)).map(cell => `${cell.cell_id} ${cell.consensus.toFixed(2)}`).join(' · ') || 'Brain-cell data'}</span> : <span className="mvp-muted">—</span>}</td>
      <td><span className={`mvp-dot ${c.penetrant ? 'penetrant' : ''}`} />{c.exposure_label ?? 'unspecified'}</td><td><span className={`mvp-chip ${c.approval_status?.status === 'approved' ? 'ok' : ''}`}>{c.approval_status?.status ?? 'unspecified'}</span></td></tr>)}{data.candidates.length === 0 && <tr><td colSpan={9}>No candidates</td></tr>}</tbody></table></div>}
  </div></div>;
}
