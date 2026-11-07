import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { InstrumentChart } from '@/components/InstrumentChart';
import { useSingleCell } from './query';
import { fmt, heatmapOption, ordered, scoreText } from './heatmap';
import './single-cell.css';

export function SingleCellPanel() {
  const { data, isLoading, error, refetch } = useSingleCell();
  const mock = useMockStatus(data?.provenance);
  const synthetic = data?.provenance.parameters?.synthetic === true;
  const groups = data ? ordered(data) : null;
  const columnGroups = groups?.signatures.reduce<{ label: string; count: number }[]>((result, s) => {
    const label = `${s.cohort} / ${s.region ?? 'unspecified'}`;
    const last = result.at(-1);
    if (last?.label === label) last.count += 1;
    else result.push({ label, count: 1 });
    return result;
  }, []) ?? [];
  const tokens = getComputedStyle(document.documentElement);
  const option = data ? heatmapOption(data, {
    teal: tokens.getPropertyValue('--ac').trim() || '#3667d9',
    warm: tokens.getPropertyValue('--warm').trim() || '#b56b29',
    surface: tokens.getPropertyValue('--s1').trim() || '#fefefe',
    muted: tokens.getPropertyValue('--line').trim() || '#e5e8ed',
  }) : null;
  return <section className="single-cell" aria-labelledby="single-cell-title">
    <BoundaryBanner /><MockRibbon show={mock || synthetic} />
    <div className="sc-content">
      <h2 id="single-cell-title">Exploratory cell types</h2>
      <Alert><AlertTitle>Exploratory analysis</AlertTitle><AlertDescription>{data?.label ?? 'Exploratory, not part of the preregistered benchmark'}</AlertDescription></Alert>
      {isLoading && <p role="status">Loading cell-type signatures…</p>}
      {error && <div role="alert"><p>{/failed: 404\b/.test(error.message) ? 'Panel not built yet' : 'Could not load cell-type signatures.'}</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></div>}
      {groups && (!groups.drugs.length || !groups.signatures.length) && <p role="status">No cell-type scores available.</p>}
      {groups && groups.drugs.length > 0 && groups.signatures.length > 0 && <>
        <p className="sc-caption">Consensus by cell-type signature. Blue / negative = reversal; warm / positive = same direction. Grey hatching / × = not scored.</p>
        <div className="sc-scroll" tabIndex={0} aria-label="Cell-type heatmap, scroll horizontally">
          <div style={{ minWidth: Math.max(1200, groups.signatures.length * 60 + 260) }}>
            <div className="sc-column-groups" aria-hidden="true"><span style={{ flex: 1 }}>Bulk</span>{columnGroups.map(g => <span key={g.label} style={{ flex: g.count }}>{g.label}</span>)}</div>
            <InstrumentChart option={option!} style={{ height: groups.drugs.length * 28 + 250 }} />
          </div>
        </div>
        <details><summary>Score values and keyboard-accessible tooltips</summary><div className="sc-scroll"><table><caption>Consensus and method scores</caption><thead><tr><th>Drug by pool rank</th><th>Bulk reference</th>{groups.signatures.map(s => <th key={s.signature_id}>{s.cohort} / {s.region ?? 'unspecified'} / {s.cell_type.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{groups.drugs.map(d => <tr key={d.candidate_id}><th>{d.pool_rank}. {d.name}</th><td>{fmt(d.bulk_consensus)}</td>{groups.signatures.map(s => <td key={s.signature_id} className={s.status === 'insufficient_donors' ? 'sc-unscored' : ''}><span tabIndex={0} title={scoreText(d, s)}>{scoreText(d, s)}</span></td>)}</tr>)}</tbody></table></div></details>
      </>}
      {groups && groups.signatures.length > 0 && <div className="sc-scroll" tabIndex={0} aria-label="Signature table"><table><caption>Signature inventory, AD minus control</caption><thead><tr>{['Cohort', 'Region', 'Cell type', 'Donors AD / control', 'Nuclei', 'Genes FDR < 0.05', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{groups.signatures.map(s => <tr key={s.signature_id}><td>{s.cohort}</td><td>{s.region ?? 'unspecified'}</td><td>{s.cell_type.replaceAll('_', ' ')}</td><td>{s.n_donors_ad} / {s.n_donors_control}</td><td>{s.n_nuclei.toLocaleString()}</td><td>{s.n_fdr05?.toLocaleString() ?? 'unspecified'}</td><td title={s.status === 'insufficient_donors' ? 'not scored: fewer than 3 donors per group' : undefined}>{s.status.replaceAll('_', ' ')}</td></tr>)}</tbody></table></div>}
      {data?.note && <p className="sc-caption">{data.note}</p>}
      {data?.cell_typing && <p className="sc-caption">{data.cell_typing}</p>}
    </div><ProvenanceStrip provenance={data?.provenance} />
  </section>;
}
