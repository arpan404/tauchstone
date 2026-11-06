import { Fragment } from 'react';
import { useBenchmark, useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { integrityMarkdown, frozenPreregistrationSha256 } from './integrity';
import './about.css';

// Render the small, fixed Markdown vocabulary used by the copied integrity log.
// React escapes all source text; there is no HTML injection or runtime docs fetch.
function inline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> :
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> :
    part.startsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>);
}

export function IntegrityLog() {
  const blocks = integrityMarkdown.trim().split(/\n\s*\n/);
  return <div className="about-log">{blocks.map((block, index) => {
    if (block.startsWith('# ')) return null;
    if (block.startsWith('## ')) return <h4 key={index}>{block.slice(3)}</h4>;
    if (block.startsWith('|')) {
      const rows = block.split('\n').map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
      const [head, , ...body] = rows;
      if (head[0] === '#') return <ol key={index} className="about-timeline">{body.map((cells) =>
        <li key={cells[0]}>
          <span className="about-event-number" aria-hidden="true">{cells[0]}</span>
          <h4>{inline(cells[1])}</h4>
          <dl>{head.slice(2).map((label, i) => <div key={label}><dt>{label}</dt><dd>{inline(cells[i + 2])}</dd></div>)}</dl>
        </li>)}</ol>;
      return <div key={index} className="about-table"><table><thead><tr>{head.map((cell) => <th key={cell}>{inline(cell)}</th>)}</tr></thead><tbody>{body.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
    }
    return <p className="whitespace-pre-line" key={index}>{inline(block)}</p>;
  })}</div>;
}

const pipeline = [
  ['Construct', 'GSE132903: AD minus control. Keep each cohort separate.'],
  ['Rank', 'Gold LINCS L1000 signatures. Negative scores indicate reversal.'],
  ['Seal', 'Freeze rules, keep development and benchmark pools disjoint.'],
  ['Attack', 'Choose a held-out test; commit before revealing one outcome.'],
  ['Replay', 'Compare policies under the same fixed experiment budget.'],
];

export function About() {
  const { data, isLoading, isError } = useBenchmark();
  const mock = useMockStatus(data?.provenance);
  const selected = data?.policies.filter((p) => ['tauchstone_hybrid', 'random', 'decision_lookahead_hybrid'].includes(p.policy));
  return <div className="about-view flex h-full flex-col">
    <BoundaryBanner />
    <MockRibbon show={mock} />
    <div className="about-body flex-1 overflow-auto p-6">
      <header>
        <h2>How it works and how we kept it honest</h2>
        <p className="text-muted-foreground">Find a drug. Attack the hypothesis. Keep only what survives.</p>
      </header>
      <section aria-labelledby="about-pipeline">
        <h3 id="about-pipeline">A ranking becomes a testable claim</h3>
        <ol className="about-pipeline">{pipeline.map(([title, detail], i) => <li key={title}>
          <span className="font-mono text-primary">{String(i + 1).padStart(2, '0')}</span>
          <h4>{title}</h4><p>{detail}</p>
          {i < pipeline.length - 1 && <span className="about-arrow" aria-hidden="true">→</span>}
        </li>)}</ol>
        <p className="text-sm text-muted-foreground">Held-out cohorts, composition sensitivity, unseen LINCS contexts and exposure lookups never feed ranking, threshold selection, tuning or demo-candidate choice. The truth table stays on the server.</p>
      </section>
      <section aria-labelledby="about-benchmark">
        <h3 id="about-benchmark">The benchmark, loaded from the API</h3>
        {isLoading && <p role="status">Loading benchmark…</p>}
        {isError && <p role="alert">Benchmark unavailable. No result is substituted.</p>}
        {data && <>
          <p>{data.n_candidates} candidates undecided before testing{data.all_candidates?.n_candidates !== undefined && `, of ${data.all_candidates.n_candidates} sealed`}. {data.n_seeds} seeds. Budget {data.budget}.</p>
          <div className="accuracy-grid">{selected?.map((p) => <div className="accuracy-policy" data-primary={p.policy === 'tauchstone_hybrid'} key={p.policy}>
            <h4>{p.policy === 'tauchstone_hybrid' ? 'Tauchstone' : p.policy === 'random' ? 'Random' : 'Decision-aware co-primary'}</h4>
            <p className="accuracy-number">{(p.decision_accuracy.estimate * 100).toFixed(1)}%</p>
            <p className="text-sm">Decision accuracy after {data.budget} tests</p>
            <meter min={0} max={1} value={p.decision_accuracy.estimate} aria-label={`${p.label} decision accuracy`} />
            <p className="font-mono text-xs text-muted-foreground">95% CI {p.decision_accuracy.ci95.map((v) => `${(v * 100).toFixed(1)}%`).join(' to ')}</p>
          </div>)}</div>
          <ul className="about-comparisons">{data.tests.filter((t) => t.policy_b === 'random' && ['tauchstone_hybrid', 'decision_lookahead_hybrid'].includes(t.policy_a)).map((t, i) => <li key={i}>
            {t.policy_a === 'tauchstone_hybrid' ? 'Tauchstone' : 'Decision-aware co-primary'} vs random: Holm p = <span className="font-mono text-primary">{t.p_holm.toPrecision(3)}</span> for {t.metric.replaceAll('_', ' ')}.
          </li>)}</ul>
          <p className="text-sm text-muted-foreground">{mock ? 'Synthetic API/fixture hash' : 'API preregistration SHA-256'}: <code className="break-all">{data.preregistration_sha256}</code></p>
        </>}
      </section>
      <section className="about-limitations" aria-labelledby="about-limitations">
        <h3 id="about-limitations">What did not hold up</h3>
        <ul>
          <li>The preregistered permutation gate was not met: 17/20 gold clinical-pool compounds had p_perm &lt; 0.05; the gate required every top-20 compound. The selection-aware rank-matched check was 15/20, a different test.</li>
          <li>The top 5 did not go beyond the shuffled-label null. A high rank alone is insufficient evidence.</li>
          <li>The decision-aware co-primary did not beat random on the sealed pool. Tauchstone tied max_failure and max_uncertainty.</li>
        </ul>
        <p>These are retrospective tests of expression-reversal hypotheses. LINCS cell contexts and bulk brain composition limit interpretation. Brain exposure is labelled measured, curated or predicted. A PDB structure supplies target context, never binding evidence.</p>
      </section>
      <section aria-labelledby="about-freeze">
        <h3 id="about-freeze">The frozen record</h3>
        <p>Preregistration committed at <code>8ed0885</code>. SHA-256 of <code>data/manifests/preregistration.yaml</code>:</p>
        <code className="about-hash">{frozenPreregistrationSha256}</code>
        {data && !mock && data.preregistration_sha256 !== frozenPreregistrationSha256 && <p role="alert">The API hash differs from the frozen record. Verify the serving bundle before citing results.</p>}
        <p className="text-sm text-muted-foreground">The timeline below copies docs/integrity_log.md verbatim, including its rounded historical result summaries. Live figures above come from /benchmark.</p>
      </section>
      <section aria-labelledby="about-integrity"><h3 id="about-integrity">Integrity log</h3><IntegrityLog /></section>
    </div>
    <ProvenanceStrip provenance={data?.provenance} />
  </div>;
}
