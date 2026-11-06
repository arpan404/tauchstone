import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Landing } from '../landing';
import { StoryMode } from './StoryMode';
import { useStory } from '@/store/story';
import { useUi } from '@/store/ui';
import { DiseaseSignatureView } from '../disease-signature/DiseaseSignatureView';
import { RepurposingView } from '../repurposing/RepurposingView';
import { EvidenceView } from '../evidence/EvidenceView';
import { AttackView } from '../tauchstone/AttackView';
import { BenchmarkView } from '../benchmark/BenchmarkView';
import '@/index.css';
const views = { signature: DiseaseSignatureView, candidates: RepurposingView, evidence: EvidenceView, attack: AttackView, benchmark: BenchmarkView };
export function Preview() {
  const [tour, setTour] = useState(false);
  const step = useUi((s) => s.step);
  const View = views[step];
  if (!tour) return <Landing onStart={() => { useStory.getState().go(0); useUi.getState().selectCandidate(null); setTour(true); }} />;
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><StoryMode onExit={() => setTour(false)} /><main style={{flex:1,minHeight:0}}><View /></main></div>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><Preview /></QueryClientProvider>);
