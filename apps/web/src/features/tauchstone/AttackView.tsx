import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CandidatePicker } from "@/app/CandidatePicker";
import {
  ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, CheckCircleIcon, CircleDashedIcon, CircleNotchIcon,
  ClockCounterClockwiseIcon, CrosshairIcon, EyeIcon, EyeSlashIcon, FlaskIcon, LightbulbIcon, ListBulletsIcon, LockIcon,
  LockSimpleIcon, PlayIcon, QuestionIcon, SealCheckIcon, WarningCircleIcon, WarningIcon, XCircleIcon,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from 'cn';
import { useRunExperiment, useStartAttack, useMockStatus, useAttackSessionSnapshot, useCandidates } from '@/api/hooks';
import { useDrug } from '@/api/mvpHooks';
import { useCurrentProject, useProjects } from '@/api/workspace';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { EmptyState, NumberTicker, Panel, Readout, StatusBadge, type Tone } from '@/components/system';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUi, type AttackMode } from '@/store/ui';
import { fmt2, testsLeftText } from './format';
import { RecommendedBadge } from './RecommendationRationale';
import { rationaleCopy } from './rationale';
import { BeliefTrace, WellMarker, type WellMarkerState } from './AttackParts';
import { useDrugGaps } from './useDrugGaps';
import { drugDisplayName, FAIL_RISK_HELP, joinSentences, MODE_HELP, P_CLAIM_HELP } from './attackCopy';
import './attack.css';

type Session = Schema<'AttackSession'>;
type Verdict = Schema<'Verdict'>;

/** Verdict names are verbatim from AGENTS.md. */
const VERDICT: Record<Verdict, { text: string; tone: Tone; icon: ReactNode }> = {
  INSUFFICIENT_EVIDENCE: { text: 'INSUFFICIENT EVIDENCE', tone: 'neutral', icon: <QuestionIcon weight="bold" /> },
  FRAGILE_CONTEXT_DEPENDENT: { text: 'FRAGILE / CONTEXT-DEPENDENT', tone: 'bad', icon: <WarningIcon weight="bold" /> },
  SUPPORTED_SO_FAR: { text: 'SUPPORTED SO FAR', tone: 'ok', icon: <SealCheckIcon weight="bold" /> },
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

function HelpLabel({ text, help, className }: { text: string; help: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span />} className={cn('cursor-help underline decoration-line-strong decoration-dotted underline-offset-2', className)}>
        {text}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">{help}</TooltipContent>
    </Tooltip>
  );
}

type LogKind = 'SEAL' | 'REVEAL' | 'BELIEF';
interface LogLine { kind: LogKind; text: string; detail?: string; tone?: 'ok' | 'bad'; at: number | null }

export function AttackView() {
  const project = useCurrentProject();
  if (project && !project.preregistered) return <PreregisteredOnly />;
  return <AttackSessionView />;
}

/** Hidden tests are built for the preregistered ranking; other projects never borrow them. */
function PreregisteredOnly() {
  const { data: projects } = useProjects();
  const setProject = useUi((s) => s.setProject);
  const prereg = projects?.find((p) => p.preregistered);
  return (
    <div className="attack flex h-full flex-col">
      <BoundaryBanner />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto mt-[8vh] max-w-xl">
          <EmptyState
            icon={<LockSimpleIcon weight="duotone" />}
            title={<span role="heading" aria-level={2}>Attack runs on the preregistered project</span>}
            action={
              <Button
                disabled={!prereg}
                onClick={() => prereg && setProject(prereg.id)}
              >
                <ArrowRightIcon />
                Open {prereg?.signature_id ?? 'GSE132903'}
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}

function AttackSessionView() {
  const { selectedCandidateId, mode, setMode, sessionId, setSessionId, setStep } = useUi();
  const qc = useQueryClient();
  const snapshot = useAttackSessionSnapshot(sessionId);
  const candidates = useCandidates();
  const drug = useDrug(selectedCandidateId);
  const [localSession, setSession] = useState<Session | null>(snapshot);
  const currentSession = localSession?.session_id === sessionId ? localSession : snapshot;
  const session = currentSession?.candidate_id === selectedCandidateId ? currentSession : null;
  const candidateName = drugDisplayName(
    selectedCandidateId,
    session?.candidate_name,
    drug.data?.name,
    candidates.data?.candidates.find((c) => c.id === selectedCandidateId)?.name,
  );
  const claimText = session && candidateName && session.candidate_id !== candidateName
    ? session.claim.text.split(session.candidate_id).join(candidateName)
    : session?.claim.text;
  // A new session starts in Attack unless the user chose a mode during this one.
  const modeTouched = useRef(false);
  const [confirmNew, setConfirmNew] = useState<AttackMode | null>(null);
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

  function handleStart(nextMode: AttackMode = mode) {
    if (!selectedCandidateId || start.isPending || run.isPending) return;
    clearTimer();
    setRunningId(null);
    setPicked(null);
    setConfirmNew(null);
    modeTouched.current = false;
    if (nextMode !== mode) setMode(nextMode);
    start.mutate(
      { candidateId: selectedCandidateId, mode: nextMode, budget },
      {
        onSuccess: (s) => {
          setSession(s);
          setSessionId(s.session_id);
          // Tests built on the fly change the drug's hidden-test count and attack readiness.
          void qc.invalidateQueries({ queryKey: ['drug'] });
          void qc.invalidateQueries({ queryKey: ['project-candidates'] });
          void qc.invalidateQueries({ queryKey: ['candidates'] });
        },
      },
    );
  }

  function handleNewSession() {
    const nextMode: AttackMode = modeTouched.current ? mode : 'attack';
    if (history.length > 0) setConfirmNew(nextMode);
    else handleStart(nextMode);
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
      <SelectTrigger aria-labelledby="session-budget-label" className="h-9 min-w-40 rounded-full border-0 bg-frost/70 pr-3 pl-3.5 font-mono text-[12.5px] ring-1 ring-ink/12 backdrop-blur hover:bg-frost/90">
        <SelectValue><FlaskIcon className="text-ink-3" />{budget} experiment{budget === 1 ? '' : 's'}</SelectValue>
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
          <div className="mx-auto mt-[8vh] max-w-xl">
            <EmptyState
              icon={<CrosshairIcon weight="duotone" />}
              title={<span role="heading" aria-level={2}>No candidate selected</span>}
              action={
                <div className="flex flex-col items-center gap-2">
                  <CandidatePicker variant="button" />
                  <Button variant="ghost" size="sm" className="rounded-full px-3 hover:bg-primary/8" onClick={() => setStep('candidates')}>
                    <ListBulletsIcon />
                    Browse candidates
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <section className="glass mx-auto mt-[4vh] max-w-3xl p-5 md:p-8" aria-label="New experiment session">
            <Eyebrow />
            <h2 className="mt-2 font-heading text-[34px] leading-[1.05] font-normal tracking-[-0.035em] text-ink md:text-[44px]">{candidateName}</h2>
            <p className="mt-2 text-[13.5px] text-ink-2">Seal held-out tests for this drug, then reveal them one committed experiment at a time.</p>
            <ol className="mt-6 grid gap-2 sm:grid-cols-3" aria-label="How a session runs">
              {[
                { icon: <LockSimpleIcon />, title: 'Seal', text: 'Outcomes stay hidden' },
                { icon: <PlayIcon />, title: 'Commit', text: 'Lock in one test' },
                { icon: <EyeIcon />, title: 'Reveal', text: 'Belief updates' },
              ].map((s, i) => (
                <li key={s.title} className="flex items-center gap-3 rounded-xl bg-frost/55 px-3 py-2.5 ring-1 ring-rim/80">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-primary [&>svg]:size-4">{s.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink"><span className="mr-1.5 font-mono text-[11px] text-ink-3">{i + 1}</span>{s.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <div className="grid gap-2">
                <label id="session-budget-label" className="text-[12px] text-ink-3">Session budget</label>
                <div className="flex items-center gap-3">
                  {budgetSelect}
                  <span className="flex gap-1.5" aria-hidden>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={cn('size-3.5 rounded-full transition-colors duration-200 motion-reduce:transition-none', i < budget ? 'bg-primary/70' : 'bg-ink/[0.08]')} />
                    ))}
                  </span>
                </div>
              </div>
              <Button size="lg" className="h-11 w-full px-6 text-[13.5px] sm:w-auto" onClick={() => handleStart()} disabled={busy}>
                <PlayIcon weight="fill" />
                {start.isPending ? 'Starting…' : 'Create experiment session'}
              </Button>
            </div>
            {start.isError && <p role="alert" className="mt-3 text-[12.5px] text-bad">Could not create the session. Retry.</p>}
          </section>
        ))}

        {session && verdict && (
          <div className="mx-auto grid max-w-[1280px] gap-4">
            <section aria-label="Claim and belief" className="glass p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 basis-80">
                  <Eyebrow session={session.session_id} />
                  <h2 className="mt-2 font-heading text-[34px] leading-[1.05] font-normal tracking-[-0.035em] text-ink md:text-[46px]">{candidateName}</h2>
                  <p className="mt-2 max-w-3xl text-[13.5px] leading-snug text-ink-2" aria-label="Claim under test">{claimText}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {session.preregistered === false && <StatusBadge tone="gap"><WarningCircleIcon />not preregistered</StatusBadge>}
                  <StatusBadge tone={verdict.tone} role="status" aria-label={`Verdict: ${verdict.text}`} className="h-8 gap-2 px-3.5 font-mono text-[12px] tracking-wide [&>svg]:size-4">
                    {verdict.icon}
                    {verdict.text}
                  </StatusBadge>
                </div>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-end">
                <div className="grid gap-5">
                  <div className="grid items-end gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                    <div role="img" aria-label={`P(claim holds) ${session.belief.p_claim_holds.toFixed(2)}`}>
                      <p className="text-[12px] text-ink-3"><HelpLabel text="P(claim holds)" help={P_CLAIM_HELP} /></p>
                      <div className="mt-1 flex items-end gap-3">
                        <span className="font-mono text-[52px] leading-none font-light tracking-[-0.05em] text-primary tabular-nums md:text-[58px]">
                          <NumberTicker value={session.belief.p_claim_holds} format={(v) => v.toFixed(2)} duration={0.9} />
                        </span>
                        {lastRevealed && Math.abs(delta) >= 0.005 && (
                          <span className={cn('mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[12px] tabular-nums', delta < 0 ? 'bg-bad/10 text-bad' : 'bg-ok/10 text-ok')}>
                            {delta < 0 ? <ArrowDownIcon weight="bold" className="size-3" /> : <ArrowUpIcon weight="bold" className="size-3" />}
                            {Math.abs(delta).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-[104px] w-full max-w-lg rounded-xl bg-frost/55 px-3 py-2.5 ring-1 ring-rim/80">
                      <BeliefTrace points={trace} slots={Math.min(session.budget, session.contexts.length)} className="h-full" />
                    </div>
                  </div>

                  <dl className="m-0 flex flex-wrap gap-x-8 gap-y-3">
                    <div role="group" aria-label={`Budget ${session.budget_remaining} of ${session.budget}; ${hiddenCount} hidden contexts; ${testsLeftText(Math.min(session.budget_remaining, hiddenCount))}`}>
                      <Stat icon={<FlaskIcon />} label="Budget" value={<>{session.budget_remaining}<span className="text-ink-3">/{session.budget}</span></>} />
                    </div>
                    <Stat icon={<LockSimpleIcon />} label="Hidden" value={hiddenCount} />
                    <Stat icon={<EyeIcon />} label="Revealed" value={revealedCount} />
                  </dl>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-ink-3">Mode</span>
                    <ModeToggle
                      label="Attack or learn mode" value={mode} disabled={busy} withHelp
                      onChange={(m) => { modeTouched.current = true; setMode(m); }}
                    />
                  </div>
                  {rec?.stale && (
                    <p className="-mt-1 text-right font-mono text-[11px] text-ink-3" aria-live="polite">
                      {rec.note}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-frost/55 px-3 py-2 ring-1 ring-rim/80">
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-3"><ArrowRightIcon className="size-3.5" />Next test</span>
                    <p className="m-0 min-w-0 truncate font-mono text-[12.5px] text-ink" aria-label="Next experiment" aria-live="polite">
                      {selectedContext ? unit(selectedContext.label) : 'none selected'}
                    </p>
                  </div>
                  <Button size="lg" className={cn('h-11 w-full text-[13.5px]', busy && 'disabled:opacity-100')} onClick={handleRunNext} disabled={!selectedContext || busy || session.budget_remaining <= 0}>
                    {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden /> : <PlayIcon weight="fill" />}
                    {run.isPending ? 'Committed · awaiting result…' : runningId ? 'Running…' : 'Commit & run test'}
                  </Button>
                  {run.isError && <p role="alert" className="m-0 text-[12.5px] text-bad">No result was returned. Retry.</p>}
                  {session.budget_remaining <= 0 && <p className="m-0 text-center font-mono text-[12px] text-ink-3">Budget exhausted</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <label id="session-budget-label" className="sr-only">Session budget</label>
                    <Button variant="outline" className="h-9 flex-1" onClick={handleNewSession} disabled={busy}>
                      <ArrowCounterClockwiseIcon />
                      {start.isPending ? 'Creating session…' : 'Start new session'}
                    </Button>
                    {budgetSelect}
                    {start.isError && <p role="alert" className="m-0 w-full text-[12.5px] text-bad">Could not create a new session. Retry.</p>}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div className="grid min-w-0 gap-4">
                <Panel aria-label="Hidden tests" title="Hidden tests" icon={<LockIcon />} caption="Sealed until committed" flush bodyClassName="px-3 pt-2 pb-3"
                  actions={<span className="font-mono text-[12px] whitespace-nowrap text-ink-3 tabular-nums">{hiddenCount} sealed · {revealedCount} revealed</span>}>
                  {rec && <span id="attack-rec-rationale" className="sr-only">{rec.title}: {joinSentences(rec.body, rec.note)}</span>}
                  <ul className="m-0 grid list-none gap-1.5 p-0">
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
                              'grid w-full grid-cols-[30px_minmax(0,1fr)_68px] items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors duration-200 outline-none motion-reduce:transition-none',
                              'focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default',
                              isPicked
                                ? 'bg-primary/10 ring-primary/25'
                                : revealed
                                  ? 'bg-frost/35 ring-rim/60'
                                  : 'bg-frost/55 ring-rim/80 enabled:hover:bg-primary/[0.06]',
                            )}>
                            <WellMarker state={state} />
                            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="min-w-0 flex-1 basis-44">
                                <span className={cn('block truncate text-[13.5px] font-medium', revealed ? 'text-ink-2' : 'text-ink')}>{unit(c.label)}</span>
                                <span className="mt-0.5 block truncate text-[12px] text-ink-3">{revealed ? 'Revealed' : 'Hidden'} · {TYPE_LABEL[c.type] ?? c.type}</span>
                              </span>
                              {state === 'running' && <StatusBadge tone="accent"><CircleNotchIcon className="animate-spin motion-reduce:animate-none" />Running</StatusBadge>}
                              {revealed && (
                                <StatusBadge tone={c.outcome === 'fail' ? 'bad' : 'ok'}>
                                  {c.outcome === 'fail' ? <XCircleIcon /> : <CheckCircleIcon />}
                                  {c.outcome === 'fail' ? 'Failed' : 'Survived'}
                                </StatusBadge>
                              )}
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
                                  <span className="block text-[11px] text-ink-3"><HelpLabel text="fail risk" help={FAIL_RISK_HELP} /></span>
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>

                <Panel aria-label="Session log" title="Session log" icon={<ClockCounterClockwiseIcon />} flush bodyClassName="px-3 pt-2 pb-3">
                  <ol className="m-0 grid max-h-64 list-none gap-1 overflow-auto p-0 font-mono text-[12px]" aria-live="polite" aria-label="Session event log">
                    <AnimatePresence initial={false}>
                      {log.map((line, i) => (
                        <motion.li key={`${line.kind}-${i}`}
                          initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                          className={cn('grid grid-cols-[40px_58px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-1.5 sm:grid-cols-[44px_62px_minmax(0,1fr)_auto]', LOG_TINT[logTint(line)])}>
                          <span className="text-ink-3 tabular-nums">{line.at ? mmss(line.at - (t0 ?? line.at)) : '00:00'}</span>
                          <span className={cn('text-[10.5px] tracking-wide', LOG_KIND_TEXT[logTint(line)])}>{line.kind}</span>
                          <span className="truncate text-ink-2">{line.text}</span>
                          {line.detail
                            ? <span className={cn('col-start-3 tabular-nums sm:col-start-auto', line.tone === 'bad' ? 'text-bad' : 'text-ok')}>{line.detail}</span>
                            : <span className="hidden sm:block" />}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ol>
                </Panel>
              </div>

              <div className="grid min-w-0 gap-4">
                <Panel aria-label="Latest result" title="Latest result" icon={<EyeIcon />} aria-live="polite">
                  {lastRevealed ? (
                    <div className="grid gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <StatusBadge tone={lastRevealed.outcome === 'survive' ? 'ok' : 'bad'}>
                          {lastRevealed.outcome === 'survive' ? <CheckCircleIcon /> : <XCircleIcon />}
                          {lastRevealed.outcome === 'survive' ? 'Survived' : 'Failed'}
                        </StatusBadge>
                        <span className="truncate text-[13px] font-medium text-ink">{unit(lastRevealed.label)}</span>
                      </div>
                      <dl className="m-0 grid grid-cols-3 gap-2">
                        <Readout label="Observed" size="sm" value={fmt2(lastRevealed.value)} className={TILE} />
                        <Readout label="Threshold" size="sm" value={lastRevealed.threshold == null ? 'rank' : fmt2(lastRevealed.threshold)} className={TILE} />
                        <Readout label="P(claim)" size="sm" className={TILE} value={
                          <span className="inline-flex items-center gap-1">
                            {lastRevealed.belief_before.toFixed(2)}
                            <ArrowRightIcon className="size-3 text-ink-3" />
                            <span className={lastRevealed.belief_after < lastRevealed.belief_before ? 'text-bad' : 'text-ok'}>{lastRevealed.belief_after.toFixed(2)}</span>
                          </span>
                        } />
                      </dl>
                      <p className="m-0 text-[12px] leading-snug text-ink-3">{lastRevealed.rule}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-xl bg-ink/[0.035] px-3 py-3 text-ink-3">
                      <EyeSlashIcon className="size-4" />
                      <span className="font-mono text-[12px]">No reveals yet</span>
                    </div>
                  )}
                </Panel>

                {gaps && gaps.length > 0 && (
                  <Panel aria-label="Open gaps" title="Open gaps" icon={<CircleDashedIcon />} caption="What this evidence does not cover">
                    <div className="flex flex-wrap gap-1.5">
                      {gaps.map((g) => <StatusBadge key={g.text} tone={g.tone}>{g.text}</StatusBadge>)}
                    </div>
                  </Panel>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <Dialog open={confirmNew !== null} onOpenChange={(v) => { if (!v) setConfirmNew(null); }}>
        <DialogContent className="gap-5 rounded-[18px] p-5 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading text-[15px] font-medium">
              <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-primary"><ArrowCounterClockwiseIcon className="size-4" /></span>
              Start a new session?
            </DialogTitle>
          </DialogHeader>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-[12.5px]">
            <dt className="text-ink-3">Current</dt>
            <dd className="m-0 font-mono text-ink-2">{revealedCount} revealed · {verdict?.text}</dd>
            <dt className="text-ink-3">Mode</dt>
            <dd className="m-0">
              <ModeToggle label="New session mode" value={confirmNew ?? 'attack'} onChange={(m) => setConfirmNew(m)} />
            </dd>
          </dl>
          <DialogFooter className="-mx-5 -mb-5 rounded-b-[18px] border-ink/[0.06] bg-ink/[0.03] px-5 py-3">
            <Button variant="outline" onClick={() => setConfirmNew(null)}>Keep session</Button>
            <Button onClick={() => handleStart(confirmNew ?? 'attack')}><ArrowCounterClockwiseIcon />Start new session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProvenanceStrip provenance={lastRevealed?.provenance} />
    </div>
  );
}

/** Frosted inner tile for readouts inside a panel. */
const TILE = 'rounded-xl bg-frost/55 px-3 py-2 ring-1 ring-rim/80';

type LogTint = 'seal' | 'ok' | 'bad' | 'belief';
const logTint = (line: LogLine): LogTint => (line.kind === 'SEAL' ? 'seal' : line.kind === 'BELIEF' ? 'belief' : line.tone === 'bad' ? 'bad' : 'ok');
const LOG_TINT: Record<LogTint, string> = {
  seal: 'bg-ink/[0.035]',
  ok: 'bg-ok/[0.07]',
  bad: 'bg-bad/[0.07]',
  belief: 'bg-primary/[0.06]',
};
const LOG_KIND_TEXT: Record<LogTint, string> = {
  seal: 'text-ink-3',
  ok: 'text-ok',
  bad: 'text-bad',
  belief: 'text-primary',
};

function Eyebrow({ session }: { session?: string }) {
  return (
    <p className="m-0 flex items-center gap-2 font-mono text-[12px] text-ink-3">
      <CrosshairIcon weight="duotone" className="size-4 text-primary" />
      <span className="text-ink-2">Attack</span>
      {session && <><span aria-hidden className="text-ink/25">·</span><span>session {session.slice(0, 8)}</span></>}
    </p>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-3 [&>svg]:size-3.5">{icon}{label}</dt>
      <dd className="m-0 mt-0.5 font-mono text-[20px] leading-tight font-normal tracking-tight text-ink tabular-nums">{value}</dd>
    </div>
  );
}

const SEG_ITEM = cn(
  'h-7 gap-1.5 rounded-full px-3 font-mono text-[12px] font-medium text-ink-2 hover:bg-primary/8 hover:text-ink [&_svg]:text-ink-3 hover:[&_svg]:text-primary',
  'aria-pressed:bg-gradient-to-b aria-pressed:from-[#2b6fd3] aria-pressed:to-[#1453ad] aria-pressed:text-white aria-pressed:[&_svg]:text-white',
  'aria-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)]',
  'aria-pressed:hover:from-[#3a7ddd] aria-pressed:hover:to-[#185cbc] aria-pressed:hover:text-white aria-pressed:hover:[&_svg]:text-white',
);
const MODE_ICON: Record<AttackMode, ReactNode> = { attack: <CrosshairIcon />, learn: <LightbulbIcon /> };

/** Attack / Learn pill segmented control. The active mode is the solid blue pill. */
function ModeToggle({ label, value, onChange, disabled, withHelp }: {
  label: string; value: AttackMode; onChange: (m: AttackMode) => void; disabled?: boolean; withHelp?: boolean;
}) {
  return (
    <ToggleGroup aria-label={label} spacing={1} className="rounded-full bg-ink/[0.05] p-0.5 ring-1 ring-ink/[0.06]"
      value={[value]} onValueChange={(v: string[]) => { if (v[0]) onChange(v[0] as AttackMode); }} disabled={disabled}>
      {(['attack', 'learn'] as const).map((m) => {
        const text = m === 'attack' ? 'Attack' : 'Learn';
        if (!withHelp) return <ToggleGroupItem key={m} value={m} className={SEG_ITEM}>{MODE_ICON[m]}{text}</ToggleGroupItem>;
        return (
          <Tooltip key={m}>
            <TooltipTrigger render={<ToggleGroupItem value={m} aria-description={MODE_HELP[m]} className={SEG_ITEM} />}>
              {MODE_ICON[m]}{text}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">{MODE_HELP[m]}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
