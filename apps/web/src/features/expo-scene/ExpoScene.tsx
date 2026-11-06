import { useEffect, useMemo, useRef, useState } from 'react';
import { useAttackSessionSnapshot, useCandidates, useMockStatus, useRunExperiment, useSignature, useStartAttack } from '@/api/hooks';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { useUi } from '@/store/ui';
import { GeneScene } from './GeneScene';
import { syntheticGenes } from './geometry';
import './expo.css';

export default function ExpoScene({ onClose }: { onClose: () => void }) {
  const signature = useSignature();
  const candidates = useCandidates();
  const { selectedCandidateId, sessionId, mode, setSessionId } = useUi();
  const snapshot = useAttackSessionSnapshot(sessionId);
  const [session, setSession] = useState<Schema<'AttackSession'> | null>(snapshot);
  const [beam, setBeam] = useState<string | null>(null);
  const [synthetic, setSynthetic] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const start = useStartAttack();
  const run = useRunExperiment(session?.session_id ?? null);
  const mock = useMockStatus(signature.data?.provenance);
  const genes = useMemo(() => synthetic ? syntheticGenes() : signature.data?.genes ?? [], [synthetic, signature.data]);
  const candidate = candidates.data?.candidates.find(c => c.id === selectedCandidateId);
  const compatibleSession = session?.candidate_id === selectedCandidateId ? session : null;
  const pending = start.isPending || run.isPending || beam !== null;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const items = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', key, true);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, [onClose]);
  function validate() {
    if (!compatibleSession?.recommended_context_id || pending) return;
    const contextId = compatibleSession.recommended_context_id;
    setBeam(contextId);
    run.mutate({ contextId, mode }, { onSuccess: result => { timer.current = setTimeout(() => { setSession(result); setBeam(null); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650); }, onError: () => setBeam(null) });
  }
  return <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="expo-title" className="expo-scene">
    <BoundaryBanner /><MockRibbon show={mock} />
    <header className="expo-header"><div><h1 id="expo-title">Find a drug. Attack the hypothesis.</h1><p>GSE132903 · AD minus control · sphere arranged by gene index</p></div><button onClick={onClose}>Close expo · Esc</button></header>
    <main className="expo-stage">
      <GeneScene genes={genes} session={compatibleSession} beam={beam} />
      <div className="expo-center"><h2>{compatibleSession?.candidate_name ?? candidate?.name ?? 'Select a candidate'}</h2><p>P(claim) <strong>{compatibleSession ? compatibleSession.belief.p_claim_holds.toFixed(2) : '—'}</strong></p></div>
      <ol className="expo-nodes">{compatibleSession?.contexts.map((context, index, contexts) => {
        const angle = index / contexts.length * Math.PI * 2 - Math.PI / 2;
        return <li key={context.context_id} className={`expo-node ${context.status === 'revealed' ? context.outcome : ''}`} style={{ left: `${50 + Math.cos(angle) * 33}%`, top: `${50 + Math.sin(angle) * 41}%` }}><span>{context.label}</span><small>{context.status === 'revealed' ? context.outcome === 'survive' ? '✓ Survived' : '✕ Failed' : context.context_id === compatibleSession.recommended_context_id ? '◎ Recommended · sealed' : '○ Sealed'}</small></li>;
      })}</ol>
      {signature.isError && <p role="alert" className="expo-fallback">Could not load the signature. Close and retry.</p>}
      {signature.isPending && <p className="expo-fallback">Loading signature…</p>}
    </main>
    <section className="expo-controls" aria-live="polite">
      {compatibleSession ? <><p>{compatibleSession.claim.text}</p><p>{compatibleSession.verdict.replaceAll('_', ' ')} · {compatibleSession.budget_remaining} of {compatibleSession.budget} tests remaining</p><p>{compatibleSession.rationale}</p><button onClick={validate} disabled={pending || !compatibleSession.recommended_context_id || compatibleSession.budget_remaining <= 0}>{pending ? 'Running…' : compatibleSession.budget_remaining <= 0 || !compatibleSession.recommended_context_id ? 'Session complete' : 'Run validation'}</button></> : <><p>{selectedCandidateId ? 'Start a five-test attack for the selected candidate.' : 'Close expo and select a candidate in Candidates first.'}</p><button disabled={!selectedCandidateId || pending} onClick={() => selectedCandidateId && start.mutate({ candidateId: selectedCandidateId, mode, budget: 5 }, { onSuccess: result => { setSession(result); setSessionId(result.session_id); } })}>Start attack session</button></>}
      {(start.isError || run.isError) && <p role="alert">Request failed. Retry the action.</p>}
      <p className="expo-legend"><span>● Warm: higher in AD</span><span>● Teal: lower in AD</span><span>Size: |stat| · brighter: query set</span></p>
      {import.meta.env.DEV && <label><input type="checkbox" checked={synthetic} onChange={e => setSynthetic(e.target.checked)} /> Synthetic 16k-point performance test {synthetic && '(visual load only)'}</label>}
    </section>
    <ProvenanceStrip provenance={signature.data?.provenance} />
  </div>;
}
