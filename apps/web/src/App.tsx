import { useMockStatus } from '@/api/hooks';
import { BenchmarkView } from '@/features/benchmark/BenchmarkView';
import { DiseaseSignatureView } from '@/features/disease-signature/DiseaseSignatureView';
import { EvidenceView } from '@/features/evidence/EvidenceView';
import { RepurposingView } from '@/features/repurposing/RepurposingView';
import { AttackView } from '@/features/tauchstone/AttackView';
import { STEPS, useUi } from '@/store/ui';
import type { StepId } from '@/store/ui';
import { useEffect } from 'react';

const VIEWS: Record<StepId, () => React.JSX.Element> = {
  signature: DiseaseSignatureView,
  candidates: RepurposingView,
  evidence: EvidenceView,
  attack: AttackView,
  benchmark: BenchmarkView,
};

export default function App() {
  const { step, setStep } = useUi();
  const mock = useMockStatus();
  const View = VIEWS[step];

  // Keyboard: 1–5 jump between steps.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx >= 0) setStep(STEPS[idx].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setStep]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafaf9] text-neutral-900">
      <nav
        aria-label="Demo steps"
        className="flex w-48 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-3"
      >
        <div className="space-y-1 px-2 pt-1 pb-3">
          <p className="text-base font-semibold">Tauchstone: Second Life</p>
          <p className="text-xs text-neutral-500">Find a drug. Attack the claim.</p>
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
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            aria-current={step === s.id ? 'step' : undefined}
            className={`rounded-md px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none ${
              step === s.id
                ? 'bg-teal-800 font-medium text-white'
                : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            <span className="block" aria-hidden>
              <span className="mr-1.5 rounded bg-neutral-200/60 px-1 font-mono text-[11px]">{i + 1}</span>
              {s.label}
            </span>
            <span className={`block pl-7 text-xs ${step === s.id ? 'text-teal-100' : 'text-neutral-500'}`}>
              {s.hint}
            </span>
          </button>
        ))}
        <div className="mt-auto px-2 pb-1 text-[11px] leading-snug text-neutral-400">
          Keyboard: 1–5 switch steps
        </div>
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1" aria-label={`Step: ${step}`}>
          <View />
        </main>
      </div>
    </div>
  );
}
