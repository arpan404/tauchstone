import { useEffect, useMemo, useRef, useState } from 'react';
import { useRunExperiment, useStartAttack, useMockStatus, useAttackSessionSnapshot, useCandidates } from '@/api/hooks';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUi } from '@/store/ui';
import { fmt2, observedText, testsLeftText } from './format';
import { RecommendationRationale } from './RecommendationRationale';
import { useDrugGaps } from './useDrugGaps';
import './attack.css';
import { TestCellGlyph } from '@/features/simulation/TestCellGlyph';

type Session = Schema<'AttackSession'>;
type Verdict = Schema<'Verdict'>;
type GlyphState = 'pending' | 'next' | 'running' | 'survive' | 'fail';

const VERDICT_PILL: Record<Verdict, { text: string; cls: string }> = {
  INSUFFICIENT_EVIDENCE: { text: 'Insufficient evidence', cls: '' },
  FRAGILE_CONTEXT_DEPENDENT: { text: 'Fragile', cls: 'bad' },
  SUPPORTED_SO_FAR: { text: 'Supported', cls: 'ok' },
};

const TYPE_LABEL: Record<string, string> = {
  held_out_cohort: 'Held-out cohort',
  composition_adjusted: 'Composition-adjusted',
  lincs_context: 'LINCS held-out',
  brain_exposure: 'Brain exposure',
  cell_type: 'Cell type',
};

const RING_C = 2 * Math.PI * 52;

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animated P(claim) readout; jumps when reduced motion is requested. */
function useAnimatedNumber(target: number, ms = 900): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || reducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(start + (target - start) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, ms]);
  return value;
}

/** Sealed labels spell micromolar as 'uM'; display it properly without touching the data. */
const unit = (label: string) => label.replace(/(\d)\s*uM\b/g, '$1 µM');

export function AttackView() {
  const { selectedCandidateId, mode, setMode, sessionId, setSessionId, setStep } = useUi();
  const snapshot = useAttackSessionSnapshot(sessionId);
  const candidates = useCandidates();
  const [localSession, setSession] = useState<Session | null>(snapshot);
  const currentSession = localSession?.session_id === sessionId ? localSession : snapshot;
  const session = currentSession?.candidate_id === selectedCandidateId ? currentSession : null;
  const candidateName = session?.candidate_name ?? candidates.data?.candidates.find((c) => c.id === selectedCandidateId)?.name ?? selectedCandidateId;
  const [budget, setBudget] = useState(5);
  const mockData = useMockStatus(session?.history?.[session.history.length - 1]?.provenance ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const start = useStartAttack();
  const run = useRunExperiment(session?.session_id ?? null);
  const gaps = useDrugGaps(session ? selectedCandidateId : null);
  const animatedP = useAnimatedNumber(session?.belief.p_claim_holds ?? 0);

  const effectivePicked = picked ?? session?.recommended_context_id ?? null;
  const selectedContext = session?.contexts.find((c) => c.context_id === effectivePicked && c.status === 'hidden');
  const nextId = runningId ?? effectivePicked;
  const hiddenCount = session ? session.contexts.filter((c) => c.status === 'hidden').length : 0;
  const pill = session ? VERDICT_PILL[session.verdict] : null;

  // Event-log clock: session start + one stamp per reveal.
  const [t0, setT0] = useState<number | null>(null);
  const [revealAt, setRevealAt] = useState<Record<string, number>>({});
  const seenSession = useRef<string | null>(null);
  useEffect(() => {
    if (session && session.session_id !== seenSession.current) {
      seenSession.current = session.session_id;
      setT0(Date.now());
      setRevealAt({});
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [session]);
  useEffect(() => {
    if (!session) return;
    setRevealAt((prev) => {
      const missing = session.history?.filter((h) => !(h.context_id in prev)) ?? [];
      if (!missing.length) return prev;
      const now = Date.now();
      const next = { ...prev };
      for (const h of missing) next[h.context_id] = now;
      return next;
    });
  }, [session]);

  const lastRevealed = session?.history?.[session.history.length - 1] ?? null;

  const log = useMemo(() => {
    if (!session) return [];
    const lines: string[] = [`session start · ${session.contexts.length} hidden tests sealed`];
    for (const h of session.history ?? []) {
      lines.push(`${unit(h.label)} · consensus ${fmt2(h.value)} · ${h.outcome}`);
      lines.push(`P(claim) ${h.belief_before.toFixed(2)} → ${h.belief_after.toFixed(2)}`);
    }
    const stamps: (number | null)[] = [t0];
    for (const h of session.history ?? []) {
      const at = revealAt[h.context_id] ?? null;
      stamps.push(at, at);
    }
    return lines.map((text, i) => ({ text, at: stamps[i] ?? null }));
  }, [session, t0, revealAt]);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function commitNow(contextId: string) {
    if (!session || run.isPending || start.isPending) return;
    run.mutate(
      { contextId, mode },
      {
        onSuccess: (s) => {
          setRunningId(null);
          setSession(s);
          setPicked(null);
        },
        onError: () => setRunningId(null),
      },
    );
  }

  function handleStart() {
    if (!selectedCandidateId || start.isPending || run.isPending) return;
    clearTimer();
    setRunningId(null);
    setPicked(null);
    start.mutate(
      { candidateId: selectedCandidateId, mode, budget },
      {
        onSuccess: (s) => {
          setSession(s);
          setSessionId(s.session_id);
        },
      },
    );
  }

  /** Locks in the selected test, shows ~1 s of `running`, then commits; the server reveals only after the commit. */
  function handleRunNext() {
    if (!session || !selectedContext || run.isPending || start.isPending || runningId || session.budget_remaining < 1) return;
    const id = selectedContext.context_id;
    setRunningId(id);
    timer.current = window.setTimeout(() => commitNow(id), reducedMotion() ? 0 : 1000);
  }

  const busy = run.isPending || start.isPending || runningId !== null;
  const budgetControl = <div className="attack-row">
    <label id="session-budget-label">Session budget</label>
    <Select value={budget} onValueChange={(value) => value !== null && setBudget(value)} disabled={busy}>
      <SelectTrigger aria-labelledby="session-budget-label"><SelectValue>{budget} experiment{budget === 1 ? '' : 's'}</SelectValue></SelectTrigger>
      <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={n}>{n} experiment{n === 1 ? '' : 's'}</SelectItem>)}</SelectContent>
    </Select>
  </div>;

  return (
    <div className="attack flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="attack-body flex-1 overflow-auto p-4 md:p-6">
        {!session && <section className="attack-card attack-empty">
          <p className="attack-kicker">Experiment workspace</p>
          <h2 className="text-xl font-semibold">{candidateName ?? 'Choose a candidate'}</h2>
          {!selectedCandidateId ? <div className="attack-row"><button type="button" className="btn2" onClick={() => setStep('candidates')}>Choose candidate</button></div> : <>
            {budgetControl}
            <div className="attack-row"><button type="button" className="btn" onClick={handleStart} disabled={busy}>{start.isPending ? 'Starting…' : 'Create experiment session'}</button></div>
            {start.isError && <p role="alert">Could not create the session.</p>}
          </>}
        </section>}

        {session && <div className="attack-grid">
          <section className="attack-card" aria-label="Claim and belief">
            <p className="attack-kicker">{session.candidate_name ?? candidateName}</p>
            <p className="mb-4 mt-1 text-sm" aria-label="Claim under test">Claim under test: {session.claim.text}</p>
            <div className="gauge" role="img" aria-label={`P(claim holds) ${session.belief.p_claim_holds.toFixed(2)}`}>
              <svg viewBox="0 0 120 120">
                <circle className="ring-bg" cx="60" cy="60" r="52" />
                <circle className="ring-fg" cx="60" cy="60" r="52" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - session.belief.p_claim_holds)} />
              </svg>
              <div className="c"><div className="v num">{animatedP.toFixed(2)}</div><div className="k">P(claim holds)</div></div>
            </div>
            <div className="attack-row">
              {pill && <span className={`verd ${pill.cls}`} role="status" aria-label={`Verdict: ${pill.text}`}>{pill.text}</span>}
              {session.preregistered === false && <span className="chip">not preregistered</span>}
            </div>
            <div className="attack-stats mt-3">
              <span aria-label={`Budget ${session.budget_remaining} of ${session.budget}; ${hiddenCount} hidden contexts; ${testsLeftText(Math.min(session.budget_remaining, hiddenCount))}`}><span className="num">{session.budget_remaining} / {session.budget}</span> budget</span>
              <span><span className="num">{hiddenCount}</span> hidden</span>
            </div>
            <div className="attack-actions">
              <button type="button" className="btn" onClick={handleRunNext} disabled={!selectedContext || busy || session.budget_remaining <= 0}>{run.isPending ? 'Committed · awaiting result…' : runningId ? 'Running…' : 'Commit & run test'}</button>
              <button type="button" className="btn2" onClick={handleStart} disabled={busy}>{start.isPending ? 'Starting…' : 'Reset'}</button>
              <div role="group" aria-label="Attack or learn mode" className="attack-row">
                {(['attack', 'learn'] as const).map((m) => (
                  <button key={m} type="button" className="btn2" aria-pressed={mode === m} onClick={() => setMode(m)} disabled={busy}>{m === 'attack' ? 'Attack' : 'Learn'}</button>
                ))}
              </div>
            </div>
            {run.isError && <p role="alert" className="mt-3 text-sm">No result was returned.</p>}
            {session.budget_remaining <= 0 && <p className="muted mt-2 text-sm">Budget exhausted.</p>}
            <ol className="attack-log" aria-live="polite" aria-label="Session event log">
              {log.map((line, i) => (
                <li key={i}><span className="mono">{line.at ? mmss(line.at - (t0 ?? line.at)) : '00:00'}</span>{line.text}</li>
              ))}
            </ol>
          </section>

          <div className="min-w-0">
            <section aria-label="Hidden tests">
              <h3 className="attack-h">Hidden tests</h3>
              <div>
                {session.contexts.map((c) => {
                  const revealed = c.status === 'revealed';
                  const state: GlyphState = revealed
                    ? (c.outcome === 'fail' ? 'fail' : 'survive')
                    : c.context_id === runningId
                      ? 'running'
                      : c.context_id === nextId
                        ? 'next'
                        : 'pending';
                  const isRec = c.context_id === session.recommended_context_id && c.status === 'hidden';
                  const isPicked = c.context_id === effectivePicked && c.status === 'hidden';
                  const failPct = Math.round((1 - (c.p_survive ?? 0)) * 100);
                  return (
                    <button key={c.context_id} type="button"
                      data-recommended={isRec} data-outcome={revealed ? c.outcome : undefined}
                      disabled={c.status !== 'hidden' || busy || session.budget_remaining < 1}
                      onClick={() => setPicked(c.context_id)} aria-pressed={isPicked}
                      className={`attack-test ${state === 'next' ? 'next' : ''}`}>
                      <TestCellGlyph state={state} />
                      <span className="min-w-0 flex-1"><span className="t">{unit(c.label)}</span>
                        <span className="s">{revealed ? `Revealed: ${c.outcome}` : `Hidden · ${TYPE_LABEL[c.type] ?? c.type} · ${failPct}% fail risk`}</span>
                        {isRec && <span className="tag">Recommended</span>}
                      </span>
                      <span className="pc num">{revealed ? (c.outcome === 'fail' ? 'Fail' : 'Survive') : runningId === c.context_id ? '…' : `${failPct}% fail risk`}</span>
                    </button>
                  );
                })}
              </div>
              {session.recommended_context_id && (
                <RecommendationRationale responseMode={session.mode} selectedMode={mode} rationale={session.rationale} />
              )}
              <div className="attack-foot text-sm" aria-live="polite">
                {selectedContext ? <p>Next experiment: {unit(selectedContext.label)}</p> : <p>No hidden experiment selected.</p>}
              </div>
            </section>

            {gaps && gaps.length > 0 && (
              <section aria-label="Open gaps" className="mt-4">
                <h3 className="attack-h">Open gaps</h3>
                <div className="chips">
                  {gaps.map((g) => <span key={g.text} className={`chip ${g.tone === 'neutral' ? '' : g.tone}`}>{g.text}</span>)}
                </div>
              </section>
            )}

            <section className="attack-latest" aria-label="Latest result" aria-live="polite">
              <h3 className="attack-h">Latest result</h3>
              {lastRevealed ? <>
                <p className="font-medium">{lastRevealed.outcome === 'survive' ? 'Survived' : 'Failed'} · {unit(lastRevealed.label)}</p>
                <p className="muted">{observedText(lastRevealed.value, lastRevealed.threshold)} · {lastRevealed.rule}</p>
                <p className="muted num">P(claim) {lastRevealed.belief_before.toFixed(3)} → {lastRevealed.belief_after.toFixed(3)}</p>
              </> : <p className="muted">No reveals yet.</p>}
            </section>
          </div>
        </div>}

        {session && <div className="attack-foot">
          {budgetControl}
          <button type="button" className="btn2" onClick={handleStart} disabled={busy}>{start.isPending ? 'Creating session…' : 'Start new session'}</button>
          <button type="button" className="btn2" onClick={() => setStep('candidates')} disabled={busy}>Change candidate</button>
          {start.isError && <p role="alert">Could not create a new session.</p>}
        </div>}
      </div>
      <ProvenanceStrip provenance={lastRevealed?.provenance} />
    </div>
  );
}
