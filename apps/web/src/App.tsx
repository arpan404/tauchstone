import { useMockStatus } from '@/api/hooks';
import { BenchmarkView } from '@/features/benchmark/BenchmarkView';
import { DiseaseSignatureView } from '@/features/disease-signature/DiseaseSignatureView';
import { EvidenceView } from '@/features/evidence/EvidenceView';
import { ExpoScene } from '@/features/expo-scene';
import { Landing } from '@/features/landing';
import { RepurposingView } from '@/features/repurposing/RepurposingView';
import { StoryMode } from '@/features/story';
import { About } from '@/features/about';
import { SingleCellPanel } from '@/features/single-cell';
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

type ExtraId = 'cells' | 'about';
const EXTRAS: Record<ExtraId, { view: () => React.JSX.Element; label: string; hint: string }> = {
  cells: { view: SingleCellPanel, label: 'Cell types', hint: 'Exploratory only' },
  about: { view: About, label: 'How it works', hint: 'And how we kept it honest' },
};

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export default function App() {
  const { step, setStep } = useUi();
  const mock = useMockStatus();
  const [screen, setScreen] = useState<Screen>('landing');
  const [touring, setTouring] = useState(false);
  const [expo, setExpo] = useState(false);
  // An extra page remembers the step it opened on, so any step change (nav, keys or the tour) leaves it.
  const [extraAt, setExtraAt] = useState<{ page: ExtraId; step: StepId } | null>(null);
  const extra = extraAt?.step === step ? extraAt.page : null;
  const openExtra = (page: ExtraId | null) => setExtraAt(page ? { page, step } : null);
  const View = extra ? EXTRAS[extra].view : VIEWS[step];

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
        setExtraAt(null);
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
      <nav aria-label="Demo steps" className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card p-3">
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
              openExtra(null);
              setStep(s.id);
            }}
            aria-current={!extra && step === s.id ? 'step' : undefined}
            className={`rounded-md px-3 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              !extra && step === s.id ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-secondary'
            }`}
          >
            <span className="block font-mono">{s.label}</span>
            <span className={`block text-xs ${!extra && step === s.id ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>
              {s.hint}
            </span>
          </button>
        ))}
        {(Object.keys(EXTRAS) as ExtraId[]).map((id) => (
          <button
            key={id}
            onClick={() => openExtra(id)}
            aria-current={extra === id ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              extra === id ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground hover:bg-secondary'
            }`}
          >
            <span className="block font-mono">{EXTRAS[id].label}</span>
            <span className={`block text-xs ${extra === id ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>
              {EXTRAS[id].hint}
            </span>
          </button>
        ))}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {!touring && (
            <button onClick={startTour} className={navButton} aria-label="Start the 3-minute tour">
              Start tour
            </button>
          )}
          <button
            onClick={() => setExpo(true)}
            className={`${navButton} ${touring ? 'col-span-2' : ''}`}
            aria-keyshortcuts="E"
            title="Keys: 1–5 switch steps, E expo mode"
          >
            Expo <span className="font-mono text-xs text-muted-foreground">(E)</span>
          </button>
        </div>
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {touring && <StoryMode onExit={() => setTouring(false)} />}
        <main className="min-h-0 flex-1" aria-label={extra ? EXTRAS[extra].label : `Step: ${step}`}>
          <View />
        </main>
      </div>
      {expoLayer}
    </div>
  );
}
