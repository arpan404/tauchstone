import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, ArrowCounterClockwiseIcon, CrosshairIcon, PlayIcon } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from 'cn';
import { useRunExperiment, useStartAttack, useMockStatus, useAttackSessionSnapshot, useCandidates } from '@/api/hooks';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { EmptyState, NumberTicker, Panel, Readout, StatusBadge, type Tone } from '@/components/system';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUi, type AttackMode } from '@/store/ui';
import { fmt2, testsLeftText } from './format';
import { RecommendedBadge } from './RecommendationRationale';
import { rationaleCopy } from './rationale';
import { BeliefTrace, WellMarker, type WellMarkerState } from './AttackParts';
import { useDrugGaps } from './useDrugGaps';
import './attack.css';

type Session = Schema<'AttackSession'>;
type Verdict = Schema<'Verdict'>;

/** Verdict names are verbatim from AGENTS.md. */
const VERDICT: Record<Verdict, { text: string; tone: Tone }> = {
  INSUFFICIENT_EVIDENCE: { text: 'INSUFFICIENT EVIDENCE', tone: 'neutral' },
  FRAGILE_CONTEXT_DEPENDENT: { text: 'FRAGILE / CONTEXT-DEPENDENT', tone: 'bad' },
  SUPPORTED_SO_FAR: { text: 'SUPPORTED SO FAR', tone: 'ok' },
};

const TYPE_LABEL: Record<string, string> = {
  held_out_cohort: 'Held-out cohort',
  composition_adjusted: 'Composition-adjusted',
  lincs_context: 'LINCS held-out',
  brain_exposure: 'Brain exposure',
  cell_type: 'Cell type',
};

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Sealed labels spell micromolar as 'uM'; display it properly without touching the data. */
const unit = (label: string) => label.replace(/(\d)\s*uM\b/g, '$1 µM');

type LogKind = 'SEAL' | 'REVEAL' | 'BELIEF';
interface LogLine { kind: LogKind; text: string; detail?: string; tone?: 'ok' | 'bad'; at: number | null }

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
  const reduce = useReducedMotion();

  const effectivePicked = picked ?? session?.recommended_context_id ?? null;
  const selectedContext = session?.contexts.find((c) => c.context_id === effectivePicked && c.status === 'hidden');
  const nextId = runningId ?? effectivePicked;
  const hiddenCount = session ? session.contexts.filter((c) => c.status === 'hidden').length : 0;
  const revealedCount = session ? session.contexts.length - hiddenCount : 0;
  const verdict = session ? VERDICT[session.verdict] : null;

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

  const history = useMemo(() => session?.history ?? [], [session]);
  const lastRevealed = history[history.length - 1] ?? null;
  const revealedById = useMemo(() => new Map(history.map((h) => [h.context_id, h])), [history]);

  const log = useMemo<LogLine[]>(() => {
    if (!session) return [];
    const lines: LogLine[] = [{ kind: 'SEAL', text: `${session.contexts.length} hidden tests sealed`, at: t0 }];
    for (const h of history) {
      const at = revealAt[h.context_id] ?? null;
      lines.push({ kind: 'REVEAL', text: unit(h.label), detail: `consensus ${fmt2(h.value)} ${h.outcome}`, tone: h.outcome === 'fail' ? 'bad' : 'ok', at });
      lines.push({ kind: 'BELIEF', text: `P(claim) ${h.belief_before.toFixed(2)} → ${h.belief_after.toFixed(2)}`, at });
    }
    return lines;
  }, [session, history, t0, revealAt]);

  const trace = useMemo(() => {
    if (!session) return [];
    if (!history.length) return [{ p: session.belief.p_claim_holds }];
    return [{ p: history[0].belief_before }, ...history.map((h) => ({ p: h.belief_after, outcome: h.outcome }))];
  }, [session, history]);

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
  const budgetSelect = (
    <Select value={budget} onValueChange={(value) => value !== null && setBudget(value)} disabled={busy}>
      <SelectTrigger aria-labelledby="session-budget-label" className="h-8 min-w-36 font-mono text-[12.5px]">
        <SelectValue>{budget} experiment{budget === 1 ? '' : 's'}</SelectValue>
      </SelectTrigger>
      <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={n}>{n} experiment{n === 1 ? '' : 's'}</SelectItem>)}</SelectContent>
    </Select>
  );

  const delta = lastRevealed ? lastRevealed.belief_after - lastRevealed.belief_before : 0;
  const rec = session ? rationaleCopy(session.mode, mode, session.rationale) : null;

  return (
    <div className="attack flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {!session && (!selectedCandidateId ? (
          <EmptyState
            className="mx-auto mt-[8vh] max-w-xl"
            icon={<CrosshairIcon />}
            title={<span role="heading" aria-level={2}>No candidate selected</span>}
            action={<Button variant="outline" onClick={() => setStep('candidates')}>Choose candidate</Button>}
          />
        ) : (
          <Panel className="mx-auto mt-[8vh] max-w-xl" aria-label="New experiment session">
            <div className="grid gap-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-heading text-[18px] font-semibold tracking-tight text-ink">{candidateName}</h2>
                <span className="font-mono text-[12px] text-ink-3">attack session</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-2 px-3 py-3">
                <div className="flex items-center gap-3">
                  <label id="session-budget-label" className="text-[12px] text-ink-3">Session budget</label>
                  {budgetSelect}
                </div>
                <div className="flex gap-1.5" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={cn('size-4 rounded-full border transition-colors duration-200 motion-reduce:transition-none', i < budget ? 'border-primary/50 bg-accent-soft' : 'border-line bg-surface')} />
                  ))}
                </div>
              </div>
              <Button size="lg" className="h-10 w-full text-[14px]" onClick={handleStart} disabled={busy}>
                <PlayIcon weight="fill" />
                {start.isPending ? 'Starting…' : 'Create experiment session'}
              </Button>
              {start.isError && <p role="alert" className="text-[12.5px] text-bad">Could not create the session. Retry.</p>}
            </div>
          </Panel>
        ))}

        {session && verdict && (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
            <Panel aria-label="Claim and belief" title={session.candidate_name ?? candidateName}
              actions={session.preregistered === false ? <StatusBadge tone="gap">not preregistered</StatusBadge> : <span className="font-mono text-[11px] text-ink-3">session {session.session_id.slice(0, 8)}</span>}>
              <div className="grid gap-5">
                <div>
                  <p className="text-[12px] text-ink-3">Claim under test</p>
                  <p className="mt-1 text-[13px] leading-snug text-ink-2" aria-label="Claim under test">{session.claim.text}</p>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div role="img" aria-label={`P(claim holds) ${session.belief.p_claim_holds.toFixed(2)}`}>
                    <p className="text-[12px] text-ink-3">P(claim holds)</p>
                    <p className="mt-1 font-mono text-[56px] leading-none font-medium tracking-[-0.06em] text-primary tabular-nums">
                      <NumberTicker value={session.belief.p_claim_holds} format={(v) => v.toFixed(2)} duration={0.9} />
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 pb-1">
                    {lastRevealed && Math.abs(delta) >= 0.005 && (
                      <span className={cn('inline-flex items-center gap-1 font-mono text-[12.5px] tabular-nums', delta < 0 ? 'text-bad' : 'text-ok')}>
                        {delta < 0 ? <ArrowDownIcon weight="bold" className="size-3" /> : <ArrowUpIcon weight="bold" className="size-3" />}
                        {Math.abs(delta).toFixed(2)}
                      </span>
                    )}
                    <StatusBadge tone={verdict.tone} role="status" aria-label={`Verdict: ${verdict.text}`} className="font-mono text-[11px] tracking-wide">
                      {verdict.text}
                    </StatusBadge>
                  </div>
                </div>

                <BeliefTrace points={trace} slots={session.budget} />

                <dl className="grid grid-cols-3 gap-3 border-y border-line py-3">
                  <div role="group" aria-label={`Budget ${session.budget_remaining} of ${session.budget}; ${hiddenCount} hidden contexts; ${testsLeftText(Math.min(session.budget_remaining, hiddenCount))}`}>
                    <Readout label="Budget" size="sm" value={<>{session.budget_remaining}<span className="text-ink-3">/{session.budget}</span></>} />
                  </div>
                  <Readout label="Hidden" size="sm" value={hiddenCount} />
                  <Readout label="Revealed" size="sm" value={revealedCount} />
                </dl>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-ink-3">Mode</span>
                    <ToggleGroup aria-label="Attack or learn mode" variant="outline" size="sm" spacing={0}
                      value={[mode]} onValueChange={(v: string[]) => v[0] && setMode(v[0] as AttackMode)} disabled={busy}>
                      <ToggleGroupItem value="attack" className="px-3 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink">Attack</ToggleGroupItem>
                      <ToggleGroupItem value="learn" className="px-3 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink">Learn</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-[12px] text-ink-3">Next test</span>
                    <p className="min-w-0 truncate font-mono text-[12.5px] text-ink" aria-label="Next experiment" aria-live="polite">
                      {selectedContext ? unit(selectedContext.label) : 'none selected'}
                    </p>
                  </div>
                  <Button size="lg" className={cn('h-10 w-full text-[14px]', busy && 'disabled:opacity-100')} onClick={handleRunNext} disabled={!selectedContext || busy || session.budget_remaining <= 0}>
                    {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden /> : <PlayIcon weight="fill" />}
                    {run.isPending ? 'Committed · awaiting result…' : runningId ? 'Running…' : 'Commit & run test'}
                  </Button>
                  {run.isError && <p role="alert" className="text-[12.5px] text-bad">No result was returned. Retry.</p>}
                  {session.budget_remaining <= 0 && <p className="text-center font-mono text-[12px] text-ink-3">Budget exhausted</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <label id="session-budget-label" className="sr-only">Session budget</label>
                  {budgetSelect}
                  <Button variant="outline" size="sm" className="h-8 flex-1" onClick={handleStart} disabled={busy}>
                    <ArrowCounterClockwiseIcon />
                    {start.isPending ? 'Creating session…' : 'Start new session'}
                  </Button>
                  {start.isError && <p role="alert" className="w-full text-[12.5px] text-bad">Could not create a new session. Retry.</p>}
                </div>
              </div>
            </Panel>

            <div className="grid min-w-0 gap-4">
              <Panel aria-label="Hidden tests" title="Hidden tests" flush
                actions={<span className="font-mono text-[12px] text-ink-3 tabular-nums">{hiddenCount} sealed  ·  {revealedCount} revealed</span>}>
                {rec && <span id="attack-rec-rationale" className="sr-only">{rec.title}: {rec.body}{rec.note ? `. ${rec.note}` : ''}</span>}
                <ul className="divide-y divide-line">
                  {session.contexts.map((c) => {
                    const revealed = c.status === 'revealed';
                    const outcome = revealed ? revealedById.get(c.context_id) : undefined;
                    const state: WellMarkerState = revealed
                      ? (c.outcome === 'fail' ? 'fail' : 'survive')
                      : c.context_id === runningId
                        ? 'running'
                        : c.context_id === nextId
                          ? 'next'
                          : 'sealed';
                    const isRec = c.context_id === session.recommended_context_id && c.status === 'hidden';
                    const isPicked = c.context_id === effectivePicked && c.status === 'hidden';
                    const failPct = Math.round((1 - (c.p_survive ?? 0)) * 100);
                    return (
                      <li key={c.context_id}>
                        <button type="button"
                          data-recommended={isRec} data-outcome={revealed ? c.outcome : undefined}
                          disabled={c.status !== 'hidden' || busy || session.budget_remaining < 1}
                          onClick={() => setPicked(c.context_id)} aria-pressed={isPicked}
                          aria-describedby={isRec ? 'attack-rec-rationale' : undefined}
                          className={cn(
                            'grid w-full grid-cols-[28px_minmax(0,1fr)_auto_84px] items-center gap-3 px-4 py-3 text-left transition-colors duration-200 outline-none motion-reduce:transition-none',
                            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:cursor-default',
                            isPicked ? 'bg-accent-soft/60 shadow-[inset_3px_0_0_var(--primary)]' : 'enabled:hover:bg-surface-2',
                          )}>
                          <WellMarker state={state} />
                          <span className="min-w-0">
                            <span className={cn('block truncate text-[13.5px] font-medium', revealed ? 'text-ink-2' : 'text-ink')}>{unit(c.label)}</span>
                            <span className="mt-0.5 block truncate text-[12px] text-ink-3">{revealed ? 'Revealed' : 'Hidden'} · {TYPE_LABEL[c.type] ?? c.type}</span>
                          </span>
                          <span className="flex items-center">
                            {state === 'running' && <StatusBadge tone="accent">Running</StatusBadge>}
                            {revealed && <StatusBadge tone={c.outcome === 'fail' ? 'bad' : 'ok'}>{c.outcome === 'fail' ? 'Failed' : 'Survived'}</StatusBadge>}
                            {isRec && state !== 'running' && <RecommendedBadge responseMode={session.mode} selectedMode={mode} rationale={session.rationale} />}
                          </span>
                          <span className="text-right font-mono tabular-nums">
                            {revealed ? (
                              <>
                                <span className="block text-[14px] text-ink">{fmt2(outcome?.value)}</span>
                                <span className="block text-[11px] text-ink-3">{outcome?.threshold == null ? 'consensus' : `vs ${fmt2(outcome.threshold)}`}</span>
                              </>
                            ) : (
                              <>
                                <span className="block text-[14px] text-ink">{failPct}%</span>
                                <span className="block text-[11px] text-ink-3">fail risk</span>
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <Panel aria-label="Latest result" title="Latest result" aria-live="polite">
                  {lastRevealed ? (
                    <div className="grid gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <StatusBadge tone={lastRevealed.outcome === 'survive' ? 'ok' : 'bad'}>{lastRevealed.outcome === 'survive' ? 'Survived' : 'Failed'}</StatusBadge>
                        <span className="truncate text-[13px] font-medium text-ink">{unit(lastRevealed.label)}</span>
                      </div>
                      <dl className="grid grid-cols-3 gap-3">
                        <Readout label="Observed" size="sm" value={fmt2(lastRevealed.value)} />
                        <Readout label="Threshold" size="sm" value={lastRevealed.threshold == null ? 'rank' : fmt2(lastRevealed.threshold)} />
                        <Readout label="P(claim)" size="sm" value={
                          <span className="inline-flex items-center gap-1">
                            {lastRevealed.belief_before.toFixed(2)}
                            <ArrowRightIcon className="size-3 text-ink-3" />
                            <span className={lastRevealed.belief_after < lastRevealed.belief_before ? 'text-bad' : 'text-ok'}>{lastRevealed.belief_after.toFixed(2)}</span>
                          </span>
                        } />
                      </dl>
                      <p className="text-[12px] leading-snug text-ink-3">{lastRevealed.rule}</p>
                    </div>
                  ) : (
                    <p className="font-mono text-[12px] text-ink-3">No reveals yet</p>
                  )}
                </Panel>

                {gaps && gaps.length > 0 && (
                  <Panel aria-label="Open gaps" title="Open gaps">
                    <div className="flex flex-wrap gap-1.5">
                      {gaps.map((g) => <StatusBadge key={g.text} tone={g.tone}>{g.text}</StatusBadge>)}
                    </div>
                  </Panel>
                )}
              </div>
              <Panel aria-label="Session log" title="Session log" flush>
                <ol className="max-h-56 overflow-auto py-2 font-mono text-[12px]" aria-live="polite" aria-label="Session event log">
                  <AnimatePresence initial={false}>
                    {log.map((line, i) => (
                      <motion.li key={`${line.kind}-${i}`}
                        initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                        className="grid grid-cols-[48px_64px_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-1">
                        <span className="text-ink-3 tabular-nums">{line.at ? mmss(line.at - (t0 ?? line.at)) : '00:00'}</span>
                        <span className={cn('text-[10.5px] tracking-wide', line.kind === 'BELIEF' ? 'text-primary' : 'text-ink-3')}>{line.kind}</span>
                        <span className="truncate text-ink-2">{line.text}</span>
                        {line.detail ? <span className={cn('tabular-nums', line.tone === 'bad' ? 'text-bad' : 'text-ok')}>{line.detail}</span> : <span />}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              </Panel>
            </div>
          </div>
        )}
      </div>
      <ProvenanceStrip provenance={lastRevealed?.provenance} />
    </div>
  );
}
