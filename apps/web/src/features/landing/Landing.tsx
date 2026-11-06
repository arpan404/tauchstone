import { useBenchmark, useCandidates, useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { benchmarkHeadline, discoveryCandidate, percent } from '../story/data';
import '../story/story.css';

export function Landing({ onStart }: { onStart: () => void }) {
  const candidates = useCandidates();
  const benchmark = useBenchmark();
  const mock = useMockStatus(benchmark.data?.provenance);
  const candidate = discoveryCandidate(candidates.data?.candidates);
  const headline = benchmarkHeadline(benchmark.data);
  return <section className="s3-landing">
    <BoundaryBanner /><MockRibbon show={mock} />
    <div className="s3-intro">
      <p className="s3-kicker">Discovery, followed by attempted falsification</p>
      <h1>Tauchstone: Second Life</h1>
      <p className="s3-tagline">Find a drug. Attack the hypothesis. Keep only what survives.</p>
      <dl className="s3-readouts">
        <div><dt>Drugs ranked</dt><dd>{candidates.data?.n_ranked.toLocaleString() ?? 'Unavailable'}</dd></div>
        <div><dt>Hidden LINCS tests prepared for the discovery leader</dt><dd>{candidate?.n_held_out_contexts ?? 'Unavailable'}</dd></div>
        <div><dt>Decision accuracy after five tests{headline.budget !== 5 ? ' • unavailable at this budget' : ''}</dt><dd>{headline.budget === 5 ? `${percent(headline.tauchstone)} vs ${percent(headline.random)}` : 'Unavailable'}</dd><p>Tauchstone vs random{headline.n !== undefined ? ` across ${headline.n} sealed drugs` : ''}</p></div>
      </dl>
      {(candidates.isError || benchmark.isError) && <p role="alert">Some API readouts could not load. The tour remains available.</p>}
      <button className="s3-primary" onClick={onStart}>Start the 3-minute tour</button>
      <p className="s3-muted">Follow the evidence. Then spend a fixed budget trying to break the claim.</p>
    </div>
  </section>;
}
