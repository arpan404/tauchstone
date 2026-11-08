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
  ['Construct', 'Find the genes that change in Alzheimer brain tissue.'],
  ['Rank', 'Score drugs whose cell response pushes those genes back.'],
  ['Seal', 'Freeze the rules and hide the test outcomes first.'],
  ['Attack', 'Pick a hidden test, commit, then reveal one outcome.'],
  ['Replay', 'Compare test-picking strategies on the same budget.'],
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
        <p className="m-0 font-heading text-[22px] font-semibold tracking-tight text-ink [font-stretch:88%]">Find a drug. Attack the hypothesis. Keep only what survives.</p>
      </header>
      <section aria-labelledby="about-pipeline">
        <h3 id="about-pipeline">A ranking becomes a testable claim</h3>
        <ol className="about-pipeline">{pipeline.map(([title, detail], i) => <li key={title}>
          <span className="font-mono text-primary">{String(i + 1).padStart(2, '0')}</span>
          <h4>{title}</h4><p>{detail}</p>
          {i < pipeline.length - 1 && <span className="about-arrow" aria-hidden="true">→</span>}
        </li>)}</ol>
      </section>
      <section aria-labelledby="about-benchmark">
        <h3 id="about-benchmark">Benchmark</h3>
        {isLoading && <p role="status">Loading benchmark…</p>}
        {isError && <p role="alert">Benchmark unavailable. No result is substituted.</p>}
        {data && <>
          <p className="text-ink-2">{data.n_candidates} candidates undecided before testing{data.all_candidates?.n_candidates !== undefined && `, of ${data.all_candidates.n_candidates} sealed`}. {data.n_seeds} seeds. Budget {data.budget}.</p>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface-2 text-left text-[12px] text-ink-3">
                <tr><th className="px-4 py-2 font-medium">Policy</th><th className="px-4 py-2 font-medium">Decision accuracy after {data.budget} tests</th><th className="px-4 py-2 font-medium">95% CI</th></tr>
              </thead>
              <tbody>{selected?.map((p) => <tr key={p.policy} className="border-t border-line" data-primary={p.policy === 'tauchstone_hybrid'}>
                <td className="px-4 py-2.5 font-medium text-ink">{p.policy === 'tauchstone_hybrid' ? 'Tauchstone' : p.policy === 'random' ? 'Random' : 'Decision-aware co-primary'}</td>
                <td className={`px-4 py-2.5 font-mono ${p.policy === 'tauchstone_hybrid' ? 'text-primary' : 'text-ink-2'}`}>
                  <meter className="sr-only" min={0} max={1} value={p.decision_accuracy.estimate} aria-label={`${p.label} decision accuracy`} />
                  {(p.decision_accuracy.estimate * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 font-mono text-ink-3">{p.decision_accuracy.ci95.map((v) => `${(v * 100).toFixed(1)}%`).join(' to ')}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <ul className="mt-3 flex list-none flex-wrap gap-2 p-0">{data.tests.filter((t) => t.policy_b === 'random' && ['tauchstone_hybrid', 'decision_lookahead_hybrid'].includes(t.policy_a)).map((t, i) => <li key={i} className="rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2">
            {t.policy_a === 'tauchstone_hybrid' ? 'Tauchstone' : 'Decision-aware co-primary'} vs random: Holm p = <span className="font-mono text-primary">{t.p_holm.toPrecision(3)}</span> for {t.metric.replaceAll('_', ' ')}.
          </li>)}</ul>
          {data && !mock && data.preregistration_sha256 !== frozenPreregistrationSha256 && <p role="alert">The API hash differs from the frozen record. Verify the serving bundle before citing results.</p>}
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
      <details className="about-record" aria-label="Full record">
        <summary>Full record</summary>
        <section aria-labelledby="about-boundary">
          <h3 id="about-boundary">What never feeds the ranking</h3>
          <p>Held-out cohorts, composition sensitivity, unseen LINCS contexts and exposure lookups never feed ranking, threshold selection, tuning or demo-candidate choice. The truth table stays on the server. Signatures are AD minus control (GSE132903); each cohort stays separate. Rankings use gold LINCS L1000 signatures.</p>
        </section>
        <section aria-labelledby="about-freeze">
          <h3 id="about-freeze">The frozen record</h3>
          <p>Preregistration committed at <code>8ed0885</code>. SHA-256 of <code>data/manifests/preregistration.yaml</code>:</p>
          <code className="about-hash">{frozenPreregistrationSha256}</code>
          {data && <p className="text-sm text-muted-foreground">{mock ? 'Synthetic API/fixture hash' : 'API preregistration SHA-256'}: <code className="break-all">{data.preregistration_sha256}</code></p>}
        </section>
        <section aria-labelledby="about-integrity"><h3 id="about-integrity">Integrity log</h3><IntegrityLog /></section>
      </details>
    </div>
    <ProvenanceStrip provenance={data?.provenance} />
  </div>;
}
