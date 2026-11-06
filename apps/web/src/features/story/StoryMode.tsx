import { useEffect, useState } from 'react';
import { useBenchmark, useCandidates, useSignature } from '@/api/hooks';
import { BoundaryBanner, BOUNDARY_TEXT } from '@/components/BoundaryBanner';
import { useUi } from '@/store/ui';
import { STORY_STEPS, useStory } from '@/store/story';
import { benchmarkHeadline, discoveryCandidate, percent } from './data';
import './story.css';

/** Renders the tour controls above the app's existing store-driven view. */
export function StoryMode({ onExit }: { onExit: () => void }) {
  const { index, go } = useStory();
  const { setStep, selectCandidate, selectedCandidateId } = useUi();
  const candidates = useCandidates();
  const signature = useSignature();
  const benchmark = useBenchmark();
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const candidate = discoveryCandidate(candidates.data?.candidates);
  const headline = benchmarkHeadline(benchmark.data);
  useEffect(() => { setStep(STORY_STEPS[index].view); }, [index, setStep]);
  useEffect(() => {
    if (!selectedCandidateId && candidate) selectCandidate(candidate.id);
  }, [candidate, selectedCandidateId, selectCandidate]);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  const captions = [
    signature.data ? `Alzheimer's changes these genes in ${signature.data.n_ad + signature.data.n_control} human brains. Positive is up in AD; negative is down.` : 'Loading the discovery signature. AD minus control defines the direction.',
    candidates.data ? `We ranked ${candidates.data.n_ranked.toLocaleString()} LINCS drugs using weighted connectivity, KS and cosine. Negative means it pushes the disease pattern back.` : 'Loading discovery ranks. Negative means reversal of the disease pattern.',
    'Is the target in the brain? Does the drug reach the brain, measured, curated or only predicted? The Mol* structure is target context, never binding evidence.',
    'Now we try to break it. Start an attack session, run validation, switch to Learn, then run validation again. Each click commits one experiment.',
    `Compare the policies${headline.n !== undefined ? ` across ${headline.n} sealed drugs` : ''}.${headline.budget === 5 ? ` After five tests: Tauchstone ${percent(headline.tauchstone)}, random ${percent(headline.random)}.` : ''} Check the benchmark below for uncertainty and corrected comparisons.`,
    BOUNDARY_TEXT,
  ];
  function navigate(next: number) { go(next); setStep(STORY_STEPS[Math.max(0, Math.min(5, next))].view); }
  return <aside className="s3-story" aria-label="Guided tour">
    <div className="s3-toolbar"><strong>3-minute tour</strong><span aria-label="Elapsed time" className="s3-clock">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span><button onClick={onExit}>Exit tour</button></div>
    <nav aria-label="Story steps" className="s3-steps">{STORY_STEPS.map((step, i) => <button key={step.title} aria-current={index === i ? 'step' : undefined} onClick={() => navigate(i)}><span>{step.time}</span>{step.title}</button>)}</nav>
    <div className="s3-caption"><p aria-live="polite">{captions[index]}</p><div><button disabled={index === 0} onClick={() => navigate(index - 1)}>Back</button><button className="s3-primary" onClick={() => index === 5 ? onExit() : navigate(index + 1)}>{index === 5 ? 'Finish tour' : 'Next'}</button></div></div>
    {index === 5 && <BoundaryBanner />}
  </aside>;
}
