import { useCandidates, useMockStatus } from '@/api/hooks';
import { BenchmarkView } from '@/features/benchmark/BenchmarkView';
import { DiseaseSignatureView } from '@/features/disease-signature/DiseaseSignatureView';
import { EvidenceView } from '@/features/evidence/EvidenceView';
import { RepurposingView } from '@/features/repurposing/RepurposingView';
import { About } from '@/features/about';
import { SingleCellPanel } from '@/features/single-cell';
import { AttackView } from '@/features/tauchstone/AttackView';
import { STEPS, useUi } from '@/store/ui';
import type { StepId } from '@/store/ui';
import { useState } from 'react';

const VIEWS: Record<StepId, () => React.JSX.Element> = {
  signature: DiseaseSignatureView,
  candidates: RepurposingView,
  evidence: EvidenceView,
  attack: AttackView,
  benchmark: BenchmarkView,
};
type ExtraId = 'cells' | 'about';
const EXTRAS = {
  cells: { view: SingleCellPanel, label: 'Cell types', hint: 'Exploratory analysis' },
  about: { view: About, label: 'Methods', hint: 'Design and limitations' },
};

export default function App() {
  const { step, setStep, selectedCandidateId } = useUi();
  const { data } = useCandidates();
  const mock = useMockStatus(data?.provenance);
  const [extraAt, setExtraAt] = useState<{ page: ExtraId; step: StepId } | null>(null);
  const extra = extraAt?.step === step ? extraAt.page : null;
  const View = extra ? EXTRAS[extra].view : VIEWS[step];
  const title = extra ? EXTRAS[extra].label : STEPS.find((s) => s.id === step)!.label;
  const candidate = data?.candidates.find((c) => c.id === selectedCandidateId);
  function navigate(next: StepId) {
    setExtraAt(null);
    setStep(next);
  }

  return (
    <div className="lab-shell">
      <a className="lab-skip" href="#workspace">Skip to workspace</a>
      <aside className="lab-sidebar">
        <div className="lab-brand">
          <span className="lab-wordmark">Tauchstone</span>
          <span className="text-xs text-muted-foreground">Second Life · Research lab</span>
        </div>
        <nav aria-label="Research workspace" className="lab-nav">
          {STEPS.map((s) => (
            <button key={s.id} onClick={() => navigate(s.id)} aria-current={!extra && step === s.id ? 'page' : undefined}>
              <span>{s.label}</span><small>{s.hint}</small>
            </button>
          ))}
          {(Object.keys(EXTRAS) as ExtraId[]).map((id) => (
            <button key={id} onClick={() => setExtraAt({ page: id, step })} aria-current={extra === id ? 'page' : undefined}>
              <span>{EXTRAS[id].label}</span><small>{EXTRAS[id].hint}</small>
            </button>
          ))}
        </nav>
        <div className="lab-sidebar-note">
          <span className="font-mono text-xs">AD − control</span>
          <p>Negative scores indicate expression reversal. Held-out evidence tests a claim; it does not set the ranking.</p>
        </div>
      </aside>
      <div className="lab-workspace">
        <header className="lab-header">
          <div><span className="lab-eyebrow">Research workspace</span><h1>{title}</h1></div>
          {mock && <span role="status" aria-label="Mock data mode" className="lab-mock">MOCK DATA · Not real results</span>}
        </header>
        <section aria-label="Selected candidate" className="lab-context">
          <div className="lab-context-name">
            <span className="lab-eyebrow">Selected candidate</span>
            <strong>{candidate?.name ?? selectedCandidateId ?? 'No candidate selected'}</strong>
            {selectedCandidateId && <span className="font-mono text-xs text-muted-foreground">{selectedCandidateId}</span>}
          </div>
          <div className="lab-context-actions">
            {selectedCandidateId ? <>
              <button onClick={() => navigate('evidence')}>View evidence</button>
              <button onClick={() => navigate('attack')}>Open experiments</button>
            </> : <button onClick={() => navigate('candidates')}>Choose a candidate</button>}
          </div>
        </section>
        <main id="workspace" tabIndex={-1} className="lab-main" aria-label={title}><View /></main>
      </div>
    </div>
  );
}
