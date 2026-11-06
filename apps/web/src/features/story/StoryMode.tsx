import { useEffect, useState } from 'react';
import { useBenchmark, useCandidates, useEvidence, useSignature } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { STORY_STEPS, useStory } from '@/store/story';
import { benchmarkHeadline, demoCandidates, featuredCandidate, percent } from './data';
import './story.css';

/** Renders the tour controls above the app's existing store-driven view. */
export function StoryMode({ onExit }: { onExit: () => void }) {
  const { index, go } = useStory();
  const { setStep } = useUi();
  const candidates = useCandidates();
  const signature = useSignature();
  const benchmark = useBenchmark();
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const demos = demoCandidates(candidates.data?.candidates);
  const e0 = useEvidence(demos[0]?.id ?? null);
  const e1 = useEvidence(demos[1]?.id ?? null);
  const e2 = useEvidence(demos[2]?.id ?? null);
  const featured = featuredCandidate(candidates.data?.candidates, [e0.data, e1.data, e2.data]);
  const evidenceSettled = [e0, e1, e2].every((q, i) => !demos[i] || !q.isPending);
  const featuredId = evidenceSettled ? featured?.id : undefined;
  const headline = benchmarkHeadline(benchmark.data);
  useEffect(() => { setStep(STORY_STEPS[index].view); }, [index, setStep]);
  // Select the featured demo candidate at the start and on reaching the evidence step;
  // the presenter can still pick another drug by hand during a step.
  useEffect(() => {
    if (!featuredId) return;
    const state = useUi.getState();
    if (!state.selectedCandidateId || index === 2) state.selectCandidate(featuredId);
  }, [featuredId, index]);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  const captions = [
    signature.data ? `Alzheimer's changes these genes in ${signature.data.n_ad + signature.data.n_control} human brains. Positive is up in AD; negative is down.` : 'Loading the discovery signature. AD minus control defines the direction.',
    candidates.data ? `We ranked ${candidates.data.n_ranked.toLocaleString()} LINCS drugs using weighted connectivity, KS and cosine. Negative means it pushes the disease pattern back.` : 'Loading discovery ranks. Negative means reversal of the disease pattern.',
    `${featured ? `${featured.name}, a preregistered demo candidate. ` : ''}Is the target in the brain? Does the drug reach the brain, measured, curated or only predicted? The Mol* structure is target context, never binding evidence.`,
    'Now we try to break it. Start an attack session, run validation, switch to Learn, then run validation again. Each click commits one experiment.',
    `${headline.nSealed !== undefined ? `Across ${headline.nSealed} sealed drugs` : 'Across the sealed drugs'}, the attack reaches the right call in fewer tests.${headline.budget === 5 ? ` After five tests (preregistered primary analysis: ${headline.n} drugs undecided before testing): Tauchstone ${percent(headline.tauchstone)}, random ${percent(headline.random)}.` : ''} The benchmark below shows uncertainty and corrected comparisons.`,
    "The banner says what this does not show: every result here is a research hypothesis, not a treatment recommendation. Anyone can rank drugs. We built the system that tries hardest to prove its own results wrong before anyone pays to test them.",
  ];
  function navigate(next: number) { go(next); setStep(STORY_STEPS[Math.max(0, Math.min(5, next))].view); }
  return <aside className="s3-story" aria-label="Guided tour">
    <div className="s3-toolbar"><strong>3-minute tour</strong><span aria-label="Elapsed time" className="s3-clock">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span><button onClick={onExit}>Exit tour</button></div>
    <nav aria-label="Story steps" className="s3-steps">{STORY_STEPS.map((step, i) => <button key={step.title} aria-current={index === i ? 'step' : undefined} onClick={() => navigate(i)}><span>{step.time}</span>{step.title}</button>)}</nav>
    <div className="s3-caption"><p aria-live="polite">{captions[index]}</p><div><button disabled={index === 0} onClick={() => navigate(index - 1)}>Back</button><button className="s3-primary" onClick={() => index === 5 ? onExit() : navigate(index + 1)}>{index === 5 ? 'Finish tour' : 'Next'}</button></div></div>
  </aside>;
}
