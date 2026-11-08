import { Fragment, type ReactNode } from 'react';
import {
  ArrowsCounterClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  ChartScatterIcon,
  ClockCounterClockwiseIcon,
  CrosshairIcon,
  DnaIcon,
  FingerprintIcon,
  ListNumbersIcon,
  LockIcon,
  PathIcon,
  ScrollIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { Panel, StatusBadge } from '@/components/system';
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

const pipeline: [string, string, ReactNode][] = [
  ['Construct', 'Find the genes that change in Alzheimer brain tissue.', <DnaIcon key="c" />],
  ['Rank', 'Score drugs whose cell response pushes those genes back.', <ListNumbersIcon key="r" />],
  ['Seal', 'Freeze the rules and hide the test outcomes first.', <LockIcon key="s" />],
  ['Attack', 'Pick a hidden test, commit, then reveal one outcome.', <CrosshairIcon key="a" />],
  ['Replay', 'Compare test-picking strategies on the same budget.', <ArrowsCounterClockwiseIcon key="p" />],
];

const policyLabel = (id: string) =>
  id === 'tauchstone_hybrid' ? 'Tauchstone' : id === 'random' ? 'Random' : 'Decision-aware co-primary';

export function About() {
  const { data, isLoading, isError } = useBenchmark();
  const mock = useMockStatus(data?.provenance);
  const selected = data?.policies.filter((p) => ['tauchstone_hybrid', 'random', 'decision_lookahead_hybrid'].includes(p.policy));
  return <div className="about-view flex h-full flex-col">
    <BoundaryBanner />
    <MockRibbon show={mock} />
    <div className="about-body flex-1 overflow-auto p-4 sm:p-6">
      <header className="glass p-6 sm:p-8">
        <p className="m-0 flex items-center gap-1.5 font-mono text-[12px] tracking-[0.02em] text-ink-3">
          <PathIcon aria-hidden className="size-4 text-primary" /> Methods
        </p>
        <h2 className="m-0 mt-2 max-w-[24ch] font-heading text-[30px] leading-[1.1] font-normal tracking-[-0.035em] text-ink sm:text-[42px]">
          Find a drug. Attack the hypothesis. Keep only what survives.
        </h2>
        <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0" aria-label="Record">
          <li><StatusBadge title={frozenPreregistrationSha256} className="font-mono"><FingerprintIcon aria-hidden className="text-primary" /><span className="font-sans">Preregistration</span> {frozenPreregistrationSha256.slice(0, 8)}</StatusBadge></li>
          <li><StatusBadge tone="gap"><ClockCounterClockwiseIcon aria-hidden /> Retrospective tests</StatusBadge></li>
          <li><StatusBadge><LockIcon aria-hidden /> Truth table stays on the server</StatusBadge></li>
        </ul>
      </header>

      <Panel title={<span id="about-pipeline">A ranking becomes a testable claim</span>} icon={<PathIcon />} aria-labelledby="about-pipeline">
        <ol className="about-pipeline">{pipeline.map(([title, detail, icon], i) => <li key={title}>
          <div className="flex items-center justify-between">
            <span className="about-step-icon" aria-hidden="true">{icon}</span>
            <span className="font-mono text-[12px] text-primary">{String(i + 1).padStart(2, '0')}</span>
          </div>
          <h4>{title}</h4><p>{detail}</p>
          {i < pipeline.length - 1 && <span className="about-arrow" aria-hidden="true"><CaretRightIcon weight="bold" /></span>}
        </li>)}</ol>
      </Panel>

      <Panel
        title={<span id="about-benchmark">Benchmark</span>}
        icon={<ChartScatterIcon />}
        aria-labelledby="about-benchmark"
        caption={data && <>{data.n_candidates} candidates undecided before testing{data.all_candidates?.n_candidates !== undefined && `, of ${data.all_candidates.n_candidates} sealed`}. {data.n_seeds} seeds. Budget {data.budget}.</>}
      >
        {isLoading && <p role="status" className="m-0 text-[13px] text-ink-3">Loading benchmark…</p>}
        {isError && <p role="alert" className="m-0 text-[13px] text-bad">Benchmark unavailable. No result is substituted.</p>}
        {data && <>
          <div className="overflow-x-auto">
            <table className="about-results w-full text-[13px]">
              <thead>
                <tr><th>Policy</th><th>Decision accuracy after {data.budget} tests</th><th>95% CI</th></tr>
              </thead>
              <tbody>{selected?.map((p) => <tr key={p.policy} data-primary={p.policy === 'tauchstone_hybrid'}>
                <td className="font-medium text-ink">{policyLabel(p.policy)}</td>
                <td className={`font-mono tabular-nums ${p.policy === 'tauchstone_hybrid' ? 'text-primary' : 'text-ink-2'}`}>
                  <meter className="sr-only" min={0} max={1} value={p.decision_accuracy.estimate} aria-label={`${p.label} decision accuracy`} />
                  {(p.decision_accuracy.estimate * 100).toFixed(1)}%
                </td>
                <td className="font-mono text-ink-3 tabular-nums">{p.decision_accuracy.ci95.map((v) => `${(v * 100).toFixed(1)}%`).join(' to ')}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">{data.tests.filter((t) => t.policy_b === 'random' && ['tauchstone_hybrid', 'decision_lookahead_hybrid'].includes(t.policy_a)).map((t, i) => <li key={i} className="rounded-full bg-frost/55 px-3 py-1 text-[12px] text-ink-2 ring-1 ring-rim/80">
            {t.policy_a === 'tauchstone_hybrid' ? 'Tauchstone' : 'Decision-aware co-primary'} vs random: Holm p = <span className="font-mono text-primary">{t.p_holm.toPrecision(3)}</span> for {t.metric.replaceAll('_', ' ')}.
          </li>)}</ul>
          {data && !mock && data.preregistration_sha256 !== frozenPreregistrationSha256 && <p role="alert" className="m-0 mt-3 rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">The API hash differs from the frozen record. Verify the serving bundle before citing results.</p>}
        </>}
      </Panel>

      <Panel title="What did not hold up" icon={<WarningIcon />} className="about-limitations">
        <ul>
          <li>The preregistered permutation gate was not met: 17/20 gold clinical-pool compounds had p_perm &lt; 0.05; the gate required every top-20 compound. The selection-aware rank-matched check was 15/20, a different test.</li>
          <li>The top 5 did not go beyond the shuffled-label null. A high rank alone is insufficient evidence.</li>
          <li>The decision-aware co-primary did not beat random on the sealed pool. Tauchstone tied max_failure and max_uncertainty.</li>
        </ul>
        <p>These are retrospective tests of expression-reversal hypotheses. LINCS cell contexts and bulk brain composition limit interpretation. Brain exposure is labelled measured, curated or predicted. A PDB structure supplies target context, never binding evidence.</p>
      </Panel>

      <details className="about-record glass" aria-label="Full record">
        <summary>
          <span className="about-step-icon" aria-hidden="true"><ScrollIcon /></span>
          <span className="flex-1">Full record</span>
          <CaretDownIcon aria-hidden className="about-caret" />
        </summary>
        <div className="about-record-body">
          <section aria-labelledby="about-boundary">
            <h3 id="about-boundary">What never feeds the ranking</h3>
            <p>Held-out cohorts, composition sensitivity, unseen LINCS contexts and exposure lookups never feed ranking, threshold selection, tuning or demo-candidate choice. The truth table stays on the server. Signatures are AD minus control (GSE132903); each cohort stays separate. Rankings use gold LINCS L1000 signatures.</p>
          </section>
          <section aria-labelledby="about-freeze">
            <h3 id="about-freeze">The frozen record</h3>
            <p>Preregistration committed at <code>8ed0885</code>. SHA-256 of <code>data/manifests/preregistration.yaml</code>:</p>
            <code className="about-hash"><FingerprintIcon aria-hidden />{frozenPreregistrationSha256}</code>
            {data && <p className="text-[12.5px] text-ink-3">{mock ? 'Synthetic API/fixture hash' : 'API preregistration SHA-256'}: <code className="break-all">{data.preregistration_sha256}</code></p>}
          </section>
          <section aria-labelledby="about-integrity"><h3 id="about-integrity">Integrity log</h3><IntegrityLog /></section>
        </div>
      </details>
    </div>
    <ProvenanceStrip provenance={data?.provenance} />
  </div>;
}
