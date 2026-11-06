import { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCandidates } from '@/api/hooks';
import { useUi } from '@/store/ui';
import { ExpoScene } from './index';
import '@/index.css';
function Harness() {
  const candidates = useCandidates();
  const select = useUi(s => s.selectCandidate);
  const [open, setOpen] = useState(false);
  return <><h1>Expo development harness</h1><p>Select a candidate from ranking data.</p>{candidates.data?.candidates.map(c => <button key={c.id} onClick={() => { select(c.id); setOpen(true); }}>{c.rank}. {c.name}</button>)}{open && <Suspense fallback={<p>Loading expo…</p>}><ExpoScene onClose={() => setOpen(false)} /></Suspense>}</>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
