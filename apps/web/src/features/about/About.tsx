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
import { metricLabel } from '@/features/benchmark/benchmarkOptions';
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
  ['Signature', "Genes up or down in Alzheimer's vs control brain (GSE132903)", <DnaIcon key="c" />],
  ['Rank', 'Score LINCS drug responses that push those genes the opposite way', <ListNumbersIcon key="r" />],
  ['Preregister', 'Write down the test rules and hide test outcomes before testing', <LockIcon key="s" />],
  ['Attack', 'Pick a hidden test, run it, see if the claim holds', <CrosshairIcon key="a" />],
  ['Replay', 'Compare test-picking strategies with the same test budget', <ArrowsCounterClockwiseIcon key="p" />],
];

const policyLabel = (id: string) =>
  id === 'tauchstone_hybrid' ? 'Tauchstone' : id === 'random' ? 'Random' : 'Two-step lookahead';

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
          How candidates are ranked and tested
        </h2>
        <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0" aria-label="Record">
          <li><StatusBadge title={frozenPreregistrationSha256} className="font-mono"><FingerprintIcon aria-hidden className="text-primary" /><span className="font-sans">Preregistration</span> {frozenPreregistrationSha256.slice(0, 8)}</StatusBadge></li>
          <li><StatusBadge tone="gap" tip="Each strategy is replayed on drugs whose hidden results were fixed in advance. It scores how well a strategy chooses tests, not how good the drugs are."><ClockCounterClockwiseIcon aria-hidden /> Replay on past data</StatusBadge></li>
          <li><StatusBadge tip="The full table of hidden results never reaches the browser. Only the result of a test you actually run is sent."><LockIcon aria-hidden /> Outcomes stay on server</StatusBadge></li>
        </ul>
      </header>

      <Panel title={<span id="about-pipeline">Method steps</span>} icon={<PathIcon />} aria-labelledby="about-pipeline">
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
        title={<span id="about-benchmark">Validation</span>}
        icon={<ChartScatterIcon />}
        aria-labelledby="about-benchmark"
        caption={data && <>{data.n_candidates}{data.all_candidates?.n_candidates !== undefined && ` of ${data.all_candidates.n_candidates}`} candidates undecided at start. {data.n_seeds} random seeds. Test budget {data.budget}.</>}
      >
        {isLoading && <p role="status" className="m-0 text-[13px] text-ink-3">Loading validation results…</p>}
        {isError && <p role="alert" className="m-0 text-[13px] text-bad">Validation results unavailable. Nothing is shown in their place.</p>}
        {data && <>
          <div className="overflow-x-auto">
            <table className="about-results w-full text-[13px]">
              <thead>
                <tr><th>Strategy</th><th>Verdict match rate after {data.budget} tests</th><th>95% CI</th></tr>
              </thead>
              <tbody>{selected?.map((p) => <tr key={p.policy} data-primary={p.policy === 'tauchstone_hybrid'}>
                <td className="font-medium text-ink">{policyLabel(p.policy)}</td>
                <td className={`font-mono tabular-nums ${p.policy === 'tauchstone_hybrid' ? 'text-primary' : 'text-ink-2'}`}>
                  <meter className="sr-only" min={0} max={1} value={p.decision_accuracy.estimate} aria-label={`${policyLabel(p.policy)} verdict match rate`} />
                  {(p.decision_accuracy.estimate * 100).toFixed(1)}%
                </td>
                <td className="font-mono text-ink-3 tabular-nums">{p.decision_accuracy.ci95.map((v) => `${(v * 100).toFixed(1)}%`).join(' to ')}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">{data.tests.filter((t) => t.policy_b === 'random' && ['tauchstone_hybrid', 'decision_lookahead_hybrid'].includes(t.policy_a)).map((t, i) => <li key={i} className="rounded-full bg-frost/55 px-3 py-1 text-[12px] text-ink-2 ring-1 ring-rim/80">
            {policyLabel(t.policy_a)} vs random, {metricLabel(t.metric)}: p = <span className="font-mono text-primary">{t.p_holm.toPrecision(3)}</span> (Holm-adjusted)
          </li>)}</ul>
          {data && !mock && data.preregistration_sha256 !== frozenPreregistrationSha256 && <p role="alert" className="m-0 mt-3 rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">The API hash differs from the frozen preregistration. Check the served data before citing results.</p>}
        </>}
      </Panel>

      <Panel title="What did not hold up" icon={<WarningIcon />} className="about-limitations">
        <ul>
          <li>Shuffled-label check not met. Of the top 20 clinical-stage compounds (gold LINCS signatures), 17 had permutation p &lt; 0.05. The preregistered gate required all 20. A separate rank-matched check, which allows for picking the top 20 out of thousands, gave 15 of 20.</li>
          <li>The top 5 did not score beyond what shuffled Alzheimer's/control labels produce. A high rank alone is not enough evidence.</li>
          <li>Two-step lookahead, one of the two primary strategies, did not beat random on the benchmark drugs. Tauchstone tied with most likely to fail first and most uncertain first.</li>
        </ul>
        <p>These tests replay past data on gene expression reversal claims. Results are limited by the LINCS cell lines, concentrations and times measured, and by the mix of cell types in bulk brain tissue. Brain exposure is labelled measured, curated or predicted. A PDB structure shows target context, never binding evidence.</p>
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
            <p>Hidden-test data never feeds the ranking, the pass thresholds, tuning or the choice of demo candidates. That covers the held-out cohorts, the cell-mix adjusted signature, LINCS conditions held back for testing and brain-exposure lookups. Hidden test outcomes stay on the server. The signature is genes up or down in Alzheimer's vs control (GSE132903). Each cohort is analysed separately. Rankings use LINCS L1000 signatures from the gold set, which pass replicate-quality filters.</p>
          </section>
          <section aria-labelledby="about-freeze">
            <h3 id="about-freeze">Preregistration record</h3>
            <p>Preregistration committed at <code>e11071c</code> (earlier ID <code>8ed0885</code>). SHA-256 of <code>data/manifests/preregistration.yaml</code>:</p>
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
