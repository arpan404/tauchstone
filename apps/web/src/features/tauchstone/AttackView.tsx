import { useRunExperiment, useStartAttack, useMockStatus, useAttackSessionSnapshot, useCandidates } from '@/api/hooks';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { VerdictBadge } from '@/components/labels';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Circle, FlaskConical, LockKeyhole, Play, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useUi } from '@/store/ui';
import { InstrumentChart as ReactECharts } from '@/components/InstrumentChart';
import { useEffect, useMemo, useRef, useState } from 'react';
import { beliefPoints, buildBeliefOption } from './beliefOption';
import { fmt2, hasIntervalWidth, observedText, testsLeftText } from './format';
import { RecommendationRationale } from './RecommendationRationale';

type Session = Schema<'AttackSession'>;

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
  const [recommendationNote, setRecommendationNote] = useState<string | null>(null);
  const prevRecommended = useRef<string | null>(null);
  const start = useStartAttack();
  const run = useRunExperiment(session?.session_id ?? null);

  const effectivePicked = picked ?? session?.recommended_context_id ?? null;
  const selectedContext = session?.contexts.find((c) => c.context_id === effectivePicked && c.status === 'hidden');
  const hiddenCount = session ? session.contexts.filter((c) => c.status === 'hidden').length : 0;
  const beliefChart = useMemo(
    () => buildBeliefOption(
      session && !session.history?.length
        ? [{ step: 0, p: session.belief.p_claim_holds }]
        : beliefPoints(session?.history ?? []),
    ),
    [session],
  );

  // Track recommendation changes caused by what was learned.
  useEffect(() => {
    const rec = session?.recommended_context_id ?? null;
    if (session && (session.history?.length ?? 0) > 0 && prevRecommended.current && rec !== prevRecommended.current) {
      const before = session.contexts.find((c) => c.context_id === prevRecommended.current);
      const after = session.contexts.find((c) => c.context_id === rec);
      setRecommendationNote(
        `Next recommendation changed: ${before?.label ?? prevRecommended.current} → ${after?.label ?? rec ?? 'none'} (belief now ${session.belief.p_claim_holds.toFixed(2)}).`,
      );
    }
    prevRecommended.current = rec;
  }, [session]);

  const lastRevealed = session?.history?.[session.history.length - 1] ?? null;

  function handleStart() {
    if (!selectedCandidateId || start.isPending || run.isPending) return;
    setRecommendationNote(null);
    prevRecommended.current = null;
    setPicked(null);
    start.mutate(
      { candidateId: selectedCandidateId, mode, budget },
      {
        onSuccess: (s) => {
          setSession(s);
          setSessionId(s.session_id);
          prevRecommended.current = s.recommended_context_id ?? null;
        },
      },
    );
  }

  function handleRun() {
    if (!session || !selectedContext || run.isPending || start.isPending || session.budget_remaining < 1) return;
    run.mutate(
      { contextId: selectedContext.context_id, mode },
      {
        onSuccess: (s) => {
          setSession(s);
          setPicked(null);
        },
      },
    );
  }

  const busy = run.isPending || start.isPending;
  const budgetControl = <div className="flex items-center gap-3">
    <label id="session-budget-label" className="text-muted-foreground">Session budget</label>
    <Select value={budget} onValueChange={(value) => value !== null && setBudget(value)} disabled={busy}>
      <SelectTrigger aria-labelledby="session-budget-label"><SelectValue>{budget} experiment{budget === 1 ? '' : 's'}</SelectValue></SelectTrigger>
      <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={n}>{n} experiment{n === 1 ? '' : 's'}</SelectItem>)}</SelectContent>
    </Select>
  </div>;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Experiment workspace</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">{candidateName ?? 'Choose a candidate'}</h2>
              <Button variant="ghost" size="sm" onClick={() => setStep('candidates')} disabled={busy}>Change candidate</Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center justify-end gap-3 text-sm">
              <span className={mode === 'attack' ? 'font-medium' : 'text-muted-foreground'}>Attack</span>
              <Switch checked={mode === 'learn'} onCheckedChange={v => setMode(v ? 'learn' : 'attack')} disabled={busy} aria-label="Toggle attack or learn mode" />
              <span className={mode === 'learn' ? 'font-medium' : 'text-muted-foreground'}>Learn</span>
            </label>
            <p className="max-w-sm text-xs text-muted-foreground">{mode === 'attack' ? 'Test the context most likely to break the claim.' : 'Test the context expected to change belief the most.'}</p>
          </div>
        </header>

        {!session && <section className="max-w-2xl rounded-[10px] border border-border bg-card p-6 text-sm">
          <FlaskConical className="mb-4 size-5 text-primary" />
          <h3 className="mb-2 text-base font-semibold">Plan a bounded experiment session</h3>
          {!selectedCandidateId ? <><p className="mb-4 text-muted-foreground">Select a ranked candidate to plan an experiment.</p><Button onClick={() => setStep('candidates')}>Choose candidate</Button></> : <>
            <p className="mb-5 text-muted-foreground">Each experiment costs 1 budget unit. Results stay hidden until you commit.</p>
            <div className="flex flex-wrap items-center gap-4">{budgetControl}<Button onClick={handleStart} disabled={busy}><Play />{start.isPending ? 'Starting…' : 'Create experiment session'}</Button></div>
            {start.isError && <p role="alert" className="mt-3 text-destructive">Could not create the session. Try again.</p>}
          </>}
        </section>}

        {session && <div className="space-y-5">
          <section className="rounded-[10px] border border-border bg-card p-4">
            <p className="mb-4 text-sm" aria-label="Claim under test">Claim under test: {session.claim.text}</p>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <VerdictBadge verdict={session.verdict} />
              <p aria-label={`Budget ${session.budget_remaining} of ${session.budget}; ${hiddenCount} hidden contexts; ${testsLeftText(Math.min(session.budget_remaining, hiddenCount))}`}><span className="font-mono">{session.budget_remaining} / {session.budget}</span> <span className="text-muted-foreground">budget remaining</span></p>
              <p aria-live="polite"><span className="text-muted-foreground">P(claim holds)</span> <span className="font-mono">{session.belief.p_claim_holds.toFixed(2)}</span>
                {hasIntervalWidth(session.belief.interval) && <span className="ml-2 text-xs text-muted-foreground">90% interval [{fmt2(session.belief.interval?.[0])}, {fmt2(session.belief.interval?.[1])}]</span>}
              </p>
            </div>
          </section>
          {recommendationNote && <p role="status" className="text-sm text-muted-foreground">{recommendationNote}</p>}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Choose a hidden experiment</h3><span className="text-xs text-muted-foreground">{hiddenCount} available</span></div>
              <div className="space-y-2">
                {session.contexts.map(c => {
                  const isRec = c.context_id === session.recommended_context_id && c.status === 'hidden';
                  const isPicked = c.context_id === effectivePicked && c.status === 'hidden';
                  return <Button key={c.context_id} variant="outline" data-recommended={isRec} data-outcome={c.status === 'revealed' ? c.outcome : undefined}
                    disabled={c.status !== 'hidden' || busy || session.budget_remaining < 1} onClick={() => setPicked(c.context_id)} aria-pressed={isPicked}
                    className={`h-auto w-full justify-start gap-3 whitespace-normal rounded-[10px] p-4 text-left ${isPicked ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'bg-card'}`}>
                    {c.status === 'revealed' ? <CheckCircle2 className="text-muted-foreground" /> : isPicked ? <CheckCircle2 className="text-primary" /> : <Circle className="text-muted-foreground" />}
                    <span className="min-w-0 flex-1"><span className="block font-medium">{c.label}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">{c.status === 'revealed' ? `Revealed: ${c.outcome}` : `Hidden · cost 1 · predicted survival ${(c.p_survive ?? 0).toFixed(2)} · acquisition ${(c.acquisition ?? 0).toFixed(2)}`}</span>
                    </span>
                    {isRec && <span className="text-xs text-primary">Recommended</span>}
                  </Button>;
                })}
              </div>
              {session.recommended_context_id && <div className="mt-3"><RecommendationRationale responseMode={session.mode} selectedMode={mode} rationale={session.rationale} /></div>}
              <footer className="mt-4 space-y-3 border-t border-border pt-4">
                <div className="text-sm" aria-live="polite">{selectedContext ? <><p className="font-medium">Next experiment: {selectedContext.label}</p><p className="mt-1 text-xs text-muted-foreground">Cost 1 · Budget {session.budget_remaining} → {session.budget_remaining - 1}. Commit to reveal one result.</p></> : <p className="text-muted-foreground">No hidden experiment selected.</p>}</div>
                <Button onClick={handleRun} disabled={!selectedContext || busy || session.budget_remaining <= 0}><Play />{run.isPending ? 'Committed · awaiting result…' : 'Commit & run experiment'}</Button>
                {run.isError && <p role="alert" className="text-sm text-destructive">No result was returned. Retry this experiment; the server enforces budget and prevents duplicate reveals.</p>}
                {session.budget_remaining <= 0 && <p className="text-sm text-muted-foreground">Budget exhausted. Review the decision or start a new session.</p>}
              </footer>
            </section>
            <aside className="min-w-0 space-y-5">
              <section className="rounded-[10px] border border-border bg-card p-4" aria-live="polite">
                <h3 className="mb-3 text-sm font-semibold">Latest result</h3>
                {lastRevealed ? <div className="space-y-2 text-sm">
                  <p className="font-medium">{lastRevealed.outcome === 'survive' ? 'Survived' : 'Failed'} · {lastRevealed.label}</p>
                  <p>{observedText(lastRevealed.value, lastRevealed.threshold)} · {lastRevealed.rule}</p>
                  <p className="text-muted-foreground">Decision update · belief <span className="font-mono">{lastRevealed.belief_before.toFixed(3)} → {lastRevealed.belief_after.toFixed(3)}</span></p>
                </div> : <div className="flex items-start gap-3 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0" /><p>Results are hidden. Commit one experiment to reveal its server result.</p></div>}
              </section>
              <section><h3 className="mb-2 text-sm font-semibold">Belief across reveals</h3><div role="img" aria-label="P(claim holds) across reveals"><ReactECharts option={beliefChart} style={{ height: 160 }} /></div></section>
              <section>
                <h3 className="mb-3 text-sm font-semibold">Experiment history</h3>
                {!session.history?.length ? <p className="text-sm text-muted-foreground">No experiments committed in this session.</p> : <ol className="divide-y divide-border">{session.history.map(h => <li key={h.context_id} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">{h.label} <span className="font-normal text-muted-foreground">· {h.outcome}</span></p>
                  <p className="text-xs text-muted-foreground">{observedText(h.value, h.threshold)} · {h.belief_before.toFixed(2)} → {h.belief_after.toFixed(2)} · mode {h.mode_used ?? session.mode} · cost 1</p>
                  <p className="text-xs text-muted-foreground">{h.rule}</p>{h.detail && <p className="text-xs text-muted-foreground">{h.detail}</p>}
                </li>)}</ol>}
              </section>
            </aside>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5 text-sm">
            {budgetControl}<Button variant="outline" onClick={handleStart} disabled={busy}><RotateCcw />{start.isPending ? 'Creating session…' : 'Start new session'}</Button>
            <p className="text-xs text-muted-foreground">Starts a fresh budget of {budget}. The current history is replaced in this workspace.</p>
            {start.isError && <p role="alert">Could not create a new session. Your current results are retained.</p>}
          </div>
        </div>}
      </div>
      <ProvenanceStrip provenance={lastRevealed?.provenance} />
    </div>
  );
}
