import { useMockStatus } from '@/api/hooks';
import { BenchmarkView } from '@/features/benchmark/BenchmarkView';
import { DiseaseSignatureView } from '@/features/disease-signature/DiseaseSignatureView';
import { EvidenceView } from '@/features/evidence/EvidenceView';
import { ExpoScene } from '@/features/expo-scene';
import { Landing } from '@/features/landing';
import { RepurposingView } from '@/features/repurposing/RepurposingView';
import { StoryMode } from '@/features/story';
import { About } from '@/features/about';
import { AttackView } from '@/features/tauchstone/AttackView';
import { useStory } from '@/store/story';
import { STEPS, useUi } from '@/store/ui';
import type { StepId } from '@/store/ui';
import { Suspense, useEffect, useState } from 'react';

const VIEWS: Record<StepId, () => React.JSX.Element> = {
  signature: DiseaseSignatureView,
  candidates: RepurposingView,
  evidence: EvidenceView,
  attack: AttackView,
  benchmark: BenchmarkView,
};

type Screen = 'landing' | 'app';

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export default function App() {
  const { step, setStep } = useUi();
  const mock = useMockStatus();
  const [screen, setScreen] = useState<Screen>('landing');
  const [touring, setTouring] = useState(false);
  const [expo, setExpo] = useState(false);
  // About remembers the step it opened on, so any step change (nav, keys or the tour) leaves it.
  const [aboutAt, setAboutAt] = useState<StepId | null>(null);
  const about = aboutAt === step;
  const setAbout = (open: boolean) => setAboutAt(open ? step : null);
  const View = about ? About : VIEWS[step];

  function startTour() {
    useStory.getState().go(0);
    setScreen('app');
    setTouring(true);
  }

  // Keyboard: 1–5 jump between steps, E opens expo mode. Off while expo mode is open.
  useEffect(() => {
    if (expo) return;
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx >= 0) {
        setScreen('app');
        setAboutAt(null);
        setStep(STEPS[idx].id);
      } else if (e.key === 'e' || e.key === 'E') {
        setExpo(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expo, setStep]);

  const expoLayer = expo && (
    <Suspense
      fallback={
        <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-background font-mono text-sm text-muted-foreground">
          Loading expo mode…
        </div>
      }
    >
      <ExpoScene onClose={() => setExpo(false)} />
    </Suspense>
  );

  if (screen === 'landing') {
    return (
      <>
        <Landing onStart={startTour} />
        {expoLayer}
      </>
    );
  }

  const navButton =
    'w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <nav aria-label="Demo steps" className="flex w-52 shrink-0 flex-col gap-1 border-r border-border bg-card p-3">
        <div className="space-y-1 px-2 pt-1 pb-3">
          <button
            onClick={() => setScreen('landing')}
            className="text-left text-base font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Tauchstone: Second Life
          </button>
          <p className="text-xs text-muted-foreground">Find a drug. Attack the claim.</p>
          {mock && (
            <p
              role="status"
              aria-label="Mock data mode"
              className="inline-block rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-amber-900"
            >
              MOCK DATA
            </p>
          )}
        </div>
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setAbout(false);
              setStep(s.id);
            }}
            aria-current={!about && step === s.id ? 'step' : undefined}
            className={`rounded-md px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              !about && step === s.id ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-secondary'
            }`}
          >
            <span className="block font-mono">{s.label}</span>
            <span className={`block text-xs ${!about && step === s.id ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>
              {s.hint}
            </span>
          </button>
        ))}
        <button
          onClick={() => setAbout(true)}
          aria-current={about ? 'page' : undefined}
          className={`rounded-md px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
            about ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-secondary'
          }`}
        >
          <span className="block font-mono">How it works</span>
          <span className={`block text-xs ${about ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>
            And how we kept it honest
          </span>
        </button>
        <div className="mt-4 flex flex-col gap-2">
          {!touring && (
            <button onClick={startTour} className={navButton}>
              Start the 3-minute tour
            </button>
          )}
          <button onClick={() => setExpo(true)} className={navButton} aria-keyshortcuts="E">
            Expo mode <span className="font-mono text-xs text-muted-foreground">(E)</span>
          </button>
        </div>
        <div className="mt-auto px-2 pb-1 text-[11px] leading-snug text-muted-foreground">
          Keyboard: 1–5 switch steps, E expo mode
        </div>
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {touring && <StoryMode onExit={() => setTouring(false)} />}
        <main className="min-h-0 flex-1" aria-label={about ? 'How it works' : `Step: ${step}`}>
          <View />
        </main>
      </div>
      {expoLayer}
    </div>
  );
}
