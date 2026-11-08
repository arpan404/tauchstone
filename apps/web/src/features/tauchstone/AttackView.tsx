import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CandidatePicker } from '@/app/CandidatePicker';
import {
  ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, ClockCounterClockwiseIcon,
  CrosshairIcon, FileTextIcon, FlaskIcon, LightbulbIcon, ListBulletsIcon, LockSimpleIcon, PlayIcon, TargetIcon,
  WarningCircleIcon,
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
import { EmptyState, NumberTicker, Panel, StatusBadge } from '@/components/system';
import { badgeTip } from '@/components/system/badgeTips';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUi, type AttackMode } from '@/store/ui';
import { fmt2 } from './format';
import { rationaleCopy } from './rationale';
import { ChanceMeter, ResultDetail, StateBadge, TestHeading, type CardState } from './AttackParts';
import { unit, VERDICT_ICON, VERDICT_TEXT, VERDICT_TONE } from './attackMeta';
import {
  budgetFor, budgetText, claimSentence, drugDisplayName, joinSentences, kindOf, MODE_HELP,
  cannotHoldLine, P_CLAIM_HELP, pct, PREREG_BUDGET, summarySentence,
} from './attackCopy';
import './attack.css';

type Session = Schema<'AttackSession'>;

/** Same tooltip as before the rename; badgeTips serves it under 'exploratory' once that key lands. */
const EXPLORATORY_TIP = badgeTip('exploratory') ?? badgeTip('not preregistered') ?? undefined;

/** Kinds shown on the start screen when the drug's own tests are not listed yet. */
const GENERIC_KINDS = ['held_out_cohort', 'composition_adjusted', 'lincs_context', 'brain_exposure'] as const;

const SEALED_LINE = 'Fixed in advance and sealed until you run them.';

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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

type LogKind = 'SETUP' | 'RESULT' | 'UPDATE';
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
            title={<span role="heading" aria-level={2}>Hidden tests exist only for the preregistered project</span>}
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
  // While the drug detail loads, say 'this drug' rather than flash its BRD id.
  const nameLoading = !!drug.isLoading && /^BRD-/i.test(candidateName ?? '');
  const shownName = nameLoading ? null : candidateName;
  // A new session starts in Attack unless the user chose a mode during this one.
  const modeTouched = useRef(false);
  const [confirmNew, setConfirmNew] = useState<AttackMode | null>(null);
  const mockData = useMockStatus(session?.history?.[session.history.length - 1]?.provenance ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const start = useStartAttack();
  const preview = useStartAttack();
  const run = useRunExperiment(session?.session_id ?? null);
  const reduce = useReducedMotion();

  // Start screen: for a drug in the sealed set, open a session in the background so the screen can
  // list its own hidden tests and starting chance. Nothing is revealed and nothing is stored outside
  // the in-memory session; 'Start test session' adopts it. Drugs outside the sealed set are never
  // previewed, because starting one builds its tests.
  const nTests = drug.data?.n_hidden_tests ?? null;
  const sealedDrug = drug.data?.preregistered === true && drug.data.attack_ready === true && (nTests ?? 0) > 0;
  const [previewSession, setPreviewSession] = useState<Session | null>(null);
  const previewFor = useRef<string | null>(null);
  useEffect(() => {
    if (session || !sealedDrug || !selectedCandidateId || previewFor.current === selectedCandidateId) return;
    previewFor.current = selectedCandidateId;
    preview.mutate(
      { candidateId: selectedCandidateId, mode, budget: budgetFor(nTests ?? 0) },
      { onSuccess: (s) => setPreviewSession(s) },
    );
  }, [session, sealedDrug, selectedCandidateId, mode, nTests, preview]);
  const shownPreview = !session && previewSession?.candidate_id === selectedCandidateId && !previewSession.history?.length
    ? previewSession : null;
  const view = session ?? shownPreview;

  const effectivePicked = picked ?? session?.recommended_context_id ?? null;
  const selectedContext = session?.contexts.find((c) => c.context_id === effectivePicked && c.status === 'hidden');
  const hiddenCount = session ? session.contexts.filter((c) => c.status === 'hidden').length : 0;
  const revealedCount = session ? session.contexts.length - hiddenCount : 0;
  const slots = session ? Math.min(session.budget, session.contexts.length) : 0;
  const testsLeft = session ? Math.min(session.budget_remaining, hiddenCount) : 0;
  const ended = !!session && testsLeft <= 0;

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
  const passed = history.filter((h) => h.outcome === 'survive').length;
  const failed = history.length - passed;

  const log = useMemo<LogLine[]>(() => {
    if (!session) return [];
    const lines: LogLine[] = [{ kind: 'SETUP', text: `${session.contexts.length} hidden tests set up`, at: t0 }];
    for (const h of history) {
      const at = revealAt[h.context_id] ?? null;
      lines.push({ kind: 'RESULT', text: `${kindOf(h.type).title}: ${unit(h.label)}`, detail: `score ${fmt2(h.value)} ${h.outcome === 'fail' ? 'failed' : 'passed'}`, tone: h.outcome === 'fail' ? 'bad' : 'ok', at });
      lines.push({ kind: 'UPDATE', text: `Chance the claim holds ${pct(h.belief_before)} → ${pct(h.belief_after)}`, at });
    }
    return lines;
  }, [session, history, t0, revealAt]);

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

  function adopt(s: Session) {
    setSession(s);
    setSessionId(s.session_id);
    setPreviewSession(null);
    // Tests built on the fly change the drug's hidden-test count and attack readiness.
    void qc.invalidateQueries({ queryKey: ['drug'] });
    void qc.invalidateQueries({ queryKey: ['project-candidates'] });
    void qc.invalidateQueries({ queryKey: ['candidates'] });
  }

  function handleStart(nextMode: AttackMode = mode) {
    if (!selectedCandidateId || start.isPending || run.isPending) return;
    clearTimer();
    setRunningId(null);
    setPicked(null);
    setConfirmNew(null);
    modeTouched.current = false;
    if (nextMode !== mode) setMode(nextMode);
    if (shownPreview && shownPreview.mode === nextMode) {
      adopt(shownPreview);
      return;
    }
    const n = session?.contexts.length ?? nTests ?? PREREG_BUDGET;
    start.mutate({ candidateId: selectedCandidateId, mode: nextMode, budget: budgetFor(n) }, { onSuccess: adopt });
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
  const rec = session ? rationaleCopy(session.mode, mode, session.rationale) : null;
  const delta = lastRevealed ? lastRevealed.belief_after - lastRevealed.belief_before : 0;
  const notPrereg = session?.preregistered === false || (!session && drug.data?.preregistered === false);
  const nShown = view?.contexts.length ?? nTests;

  if (!selectedCandidateId && !session) {
    return (
      <div className="attack flex h-full flex-col">
        <BoundaryBanner />
        <div className="flex-1 overflow-auto p-4 md:p-6">
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
        </div>
      </div>
    );
  }

  const runButton = (
    <Button size="lg" className={cn('h-10 w-full text-[13px]', busy && 'disabled:opacity-100')} onClick={handleRunNext}
      disabled={!selectedContext || busy || session?.budget_remaining === undefined || session.budget_remaining <= 0}>
      {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-on-ink/40 border-t-on-ink motion-reduce:animate-none" aria-hidden /> : <PlayIcon weight="fill" />}
      {run.isPending ? 'Waiting for result…' : runningId ? 'Running…' : 'Run test'}
    </Button>
  );

  return (
    <div className="attack flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-[1280px] gap-4">
          <section aria-label={session ? 'Claim and result' : 'New test session'} className="glass min-w-0 p-5 md:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
              {/* Claim */}
              <div className="min-w-0">
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-ink-3">
                  <CrosshairIcon weight="duotone" className="size-4 text-primary" />
                  <span className="text-ink-2">Attack</span>
                  {session && <><span aria-hidden className="text-ink/25">·</span><span>session {session.session_id.slice(0, 8)}</span></>}
                </p>
                <h2 className="mt-3 font-heading text-[30px] leading-[1.08] font-normal tracking-[-0.035em] text-ink md:text-[42px]">
                  Can we break the claim about {shownName ?? 'this drug'}?
                </h2>
                <blockquote className="m-0 mt-4 rounded-xl bg-primary/[0.07] px-4 py-3 ring-1 ring-primary/15">
                  <p className="m-0 text-[11.5px] font-medium text-primary">The claim</p>
                  <p className="m-0 mt-1 text-[16px] leading-snug text-ink md:text-[17px]" aria-label="Claim under test">
                    {claimSentence(shownName ?? 'This drug', view?.claim.q ?? 0.7)}
                  </p>
                </blockquote>
                {notPrereg && (
                  <p className="m-0 mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                    <StatusBadge tone="gap" tip={EXPLORATORY_TIP}><WarningCircleIcon />Exploratory</StatusBadge>
                    This drug is outside the sealed set, so its hidden tests were not preregistered. They are built under the same frozen rules.
                  </p>
                )}
                {/* Hidden tests */}
                <div className="mt-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="m-0 flex items-center gap-2 text-[15px] font-medium text-ink">
                      <LockSimpleIcon className="size-4 text-primary" />
                      {view ? 'The hidden tests' : 'Kinds of hidden test'}
                    </h3>
                    {session && (
                      <span className="font-mono text-[12px] text-ink-3 tabular-nums">{hiddenCount} sealed · {revealedCount} run</span>
                    )}
                  </div>
                  <p className="m-0 mt-1 max-w-3xl text-[12.5px] leading-snug text-ink-3">
                    {!view && (nTests
                      ? `${nTests} hidden ${nTests === 1 ? 'test is' : 'tests are'} set aside for this drug. Each is one of these kinds. `
                      : 'Each hidden test is one of these kinds. ')}
                    {SEALED_LINE}
                  </p>
                  {rec && <span id="attack-rec-rationale" className="sr-only">{rec.title}: {joinSentences(rec.body, rec.note)}</span>}

                  <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                    {!view && GENERIC_KINDS.map((t) => (
                      <li key={t} className="rounded-xl bg-frost/55 px-3.5 py-3 ring-1 ring-rim/80">
                        <TestHeading type={t} badge={<StateBadge state="sealed" />} />
                      </li>
                    ))}
                    {view?.contexts.map((c, i, all) => {
                      const repeatKind = i > 0 && all[i - 1].type === c.type;
                      const revealed = !!session && c.status === 'revealed';
                      const outcome = revealed ? revealedById.get(c.context_id) : undefined;
                      const hidden = c.status === 'hidden';
                      const isRec = !!session && hidden && c.context_id === session.recommended_context_id;
                      const isSelected = !!session && hidden && c.context_id === effectivePicked;
                      const state: CardState = revealed && outcome
                        ? (outcome.outcome === 'fail' ? 'failed' : 'passed')
                        : c.context_id === runningId ? 'running' : isRec ? 'suggested' : 'sealed';
                      const badge = <StateBadge state={state} text={state === 'suggested' && rec?.stale ? rec.badge : undefined} />;
                      const pickable = !!session && hidden && !busy && session.budget_remaining >= 1;
                      return (
                        <li key={c.context_id}
                          data-state={state} data-recommended={isRec || undefined} data-outcome={revealed ? outcome?.outcome : undefined}
                          className={cn(
                            'flex min-w-0 flex-col rounded-xl px-3.5 py-3 ring-1 transition-colors duration-200 motion-reduce:transition-none',
                            isSelected ? 'bg-primary/[0.07] ring-2 ring-primary/45'
                              : isRec ? 'bg-primary/[0.04] ring-primary/30'
                                : revealed ? 'bg-frost/40 ring-rim/60' : 'bg-frost/55 ring-rim/80',
                          )}>
                          {session ? (
                            <button type="button" aria-pressed={hidden ? isSelected : undefined} disabled={!pickable}
                              onClick={() => setPicked(c.context_id)} aria-describedby={isRec ? 'attack-rec-rationale' : undefined}
                              className="-m-1 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary enabled:cursor-pointer disabled:cursor-default">
                              <TestHeading type={c.type} label={c.label} badge={badge} hideChecks={repeatKind} />
                            </button>
                          ) : (
                            <TestHeading type={c.type} label={c.label} badge={badge} hideChecks={repeatKind} />
                          )}
                          {outcome && <div className="mt-2 ml-12"><ResultDetail r={outcome} /></div>}
                        </li>
                      );
                    })}
                  </ul>
                  {ended && session && session.budget_remaining <= 0 && hiddenCount > 0 && (
                    <p className="m-0 mt-3 font-mono text-[12px] text-ink-3">No tests left in budget</p>
                  )}
                </div>
              </div>

              {/* Chance, verdict, budget and the main action */}
              <aside aria-label="Chance and verdict" className="grid content-start gap-4 self-start rounded-xl lg:sticky lg:top-0 bg-frost/55 p-4 ring-1 ring-rim/80 md:p-5">
                {ended && session && (
                  <p className="m-0 rounded-lg bg-primary/[0.08] px-3 py-2.5 text-[13.5px] leading-snug font-medium text-ink" aria-live="polite">
                    {summarySentence(passed, failed, session.belief.p_claim_holds, '').replace(/ Verdict: \.$/, '')}{' '}
                    Verdict: <span className="whitespace-nowrap">{VERDICT_TEXT[session.verdict]}</span>.
                    {hiddenCount > 0 && <span className="font-normal text-ink-2"> {hiddenCount} {hiddenCount === 1 ? 'test stays' : 'tests stay'} sealed.</span>}
                  </p>
                )}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0" role="img" aria-label={view ? `Chance the claim holds ${pct(view.belief.p_claim_holds)}` : 'Chance the claim holds: shown when the session starts'}>
                    <p className="m-0 text-[12px] text-ink-3"><HelpLabel text="Chance the claim holds" help={`${P_CLAIM_HELP} 80% or more is SUPPORTED SO FAR, 20% or less is FRAGILE / CONTEXT-DEPENDENT, in between is INSUFFICIENT EVIDENCE.`} /></p>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="font-mono text-[48px] leading-none font-light tracking-[-0.05em] text-primary tabular-nums md:text-[54px]">
                        {view ? <NumberTicker value={view.belief.p_claim_holds * 100} format={(v) => `${Math.round(v)}%`} duration={0.9} /> : '?'}
                      </span>
                      {lastRevealed && Math.round(Math.abs(delta) * 100) >= 1 && (
                        <span className={cn('mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11.5px] tabular-nums', delta < 0 ? 'bg-bad/10 text-bad' : 'bg-ok/10 text-ok')}>
                          {delta < 0 ? <ArrowDownIcon weight="bold" className="size-3" /> : <ArrowUpIcon weight="bold" className="size-3" />}
                          from {pct(lastRevealed.belief_before)}
                        </span>
                      )}
                    </div>
                  </div>
                  {view && (
                    <StatusBadge tone={VERDICT_TONE[view.verdict]} tip={false}
                      role={session ? 'status' : undefined} aria-label={session ? `Verdict: ${VERDICT_TEXT[view.verdict]}` : undefined}
                      className="h-7 max-w-full gap-1.5 px-3 font-mono text-[11.5px] tracking-wide whitespace-normal [&>svg]:size-3.5">
                      {VERDICT_ICON[view.verdict]}
                      {VERDICT_TEXT[view.verdict]}
                    </StatusBadge>
                  )}
                </div>
                <ChanceMeter p={view ? view.belief.p_claim_holds : null} verdict={view?.verdict ?? null} />
                {session && cannotHoldLine(failed, session.claim.n_contexts, session.claim.q) && (
                  <p className="m-0 rounded-lg bg-bad/[0.07] px-3 py-2 text-[12.5px] leading-snug text-ink-2">{cannotHoldLine(failed, session.claim.n_contexts, session.claim.q)}</p>
                )}

                {!session && (
                  <div className="grid gap-3 border-t border-ink/[0.07] pt-4">
                    <p className="m-0 flex items-start gap-2 text-[13px] text-ink">
                      <FlaskIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <HelpLabel text={nShown != null ? budgetText(nShown) : `Up to ${PREREG_BUDGET} tests can be run (budget fixed in advance)`}
                        help="Like a real lab, you cannot run every experiment. The budget of 5 was fixed before any result was seen; each test you run uses one." />
                    </p>
                    <Button size="lg" className="h-11 w-full text-[13.5px]" onClick={() => handleStart()} disabled={busy}>
                      <PlayIcon weight="fill" />
                      {start.isPending ? 'Starting…' : 'Start test session'}
                    </Button>
                    {start.isError && <p role="alert" className="m-0 text-[12.5px] text-bad">Could not start the session. Retry.</p>}
                  </div>
                )}

                {session && (
                  <div className="grid gap-3 border-t border-ink/[0.07] pt-4">
                    <div role="group" aria-label={`${revealedCount} of ${slots} tests run; ${testsLeft} left`} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] text-ink">
                        <span className="font-mono tabular-nums">{Math.min(revealedCount, slots)} of {slots}</span> tests run
                        <span className="text-ink-3"> · {testsLeft} left</span>
                      </span>
                      <span className="flex gap-1.5" aria-hidden>
                        {Array.from({ length: slots }, (_, i) => {
                          const h = history[i];
                          return <span key={i} className={cn('size-3 rounded-full', h ? (h.outcome === 'fail' ? 'bg-bad' : 'bg-ok') : 'bg-ink/[0.1]')} />;
                        })}
                      </span>
                    </div>
                    {!ended && selectedContext && (
                      <div className="grid gap-2 rounded-xl bg-primary/[0.06] p-3 ring-1 ring-primary/15" aria-label="Next test">
                        <p className="m-0 text-[11.5px] text-ink-3">
                          {selectedContext.context_id === session.recommended_context_id ? 'Suggested next test' : 'Your pick'}
                        </p>
                        <p className="m-0 text-[14px] leading-snug font-medium text-ink">
                          {kindOf(selectedContext.type).title}
                          <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-3">{unit(selectedContext.label)}</span>
                        </p>
                        {selectedContext.context_id === session.recommended_context_id && session.rationale && (
                          <p className="m-0 flex items-start gap-1.5 text-[12px] leading-snug text-primary">
                            <TargetIcon className="mt-0.5 size-3.5 shrink-0" />{session.rationale}
                          </p>
                        )}
                        {runButton}
                      </div>
                    )}
                    {run.isError && <p role="alert" className="m-0 text-[12.5px] text-bad">No result was returned. Retry.</p>}
                    <div className="flex flex-wrap gap-2">
                      {ended && (
                        <Button className="h-9 flex-1" onClick={() => setStep('report')}>
                          <FileTextIcon />
                          Open report
                        </Button>
                      )}
                      <Button variant="outline" className="h-9 flex-1" onClick={handleNewSession} disabled={busy}>
                        <ArrowCounterClockwiseIcon />
                        {start.isPending ? 'Starting…' : 'Start new session'}
                      </Button>
                    </div>
                    {start.isError && <p role="alert" className="m-0 text-[12.5px] text-bad">Could not start a new session. Retry.</p>}
                    {!ended && (
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11.5px] text-ink-3">Suggest</span>
                          <ModeToggle label="How to suggest the next test" value={mode} disabled={busy} withHelp
                            onChange={(m) => { modeTouched.current = true; setMode(m); }} />
                        </div>
                        {rec?.stale && <p className="m-0 font-mono text-[11px] text-ink-3" aria-live="polite">{rec.note}</p>}
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </div>

          </section>

          {session && (
            <div className="grid items-start gap-4">
              <Panel aria-label="Session log" title="Session log" icon={<ClockCounterClockwiseIcon />} caption="Every step, in order" flush bodyClassName="px-3 pt-2 pb-3">
                <ol className="m-0 grid max-h-64 list-none gap-1 overflow-auto p-0 font-mono text-[12px]" aria-live="polite" aria-label="Session event log">
                  <AnimatePresence initial={false}>
                    {log.map((line, i) => (
                      <motion.li key={`${line.kind}-${i}`}
                        initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                        className={cn('grid grid-cols-[40px_58px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 rounded-lg px-3 py-1.5 sm:grid-cols-[44px_62px_minmax(0,1fr)_auto]', LOG_TINT[logTint(line)])}>
                        <span className="text-ink-3 tabular-nums">{line.at ? mmss(line.at - (t0 ?? line.at)) : '00:00'}</span>
                        <span className={cn('text-[10.5px] tracking-wide', LOG_KIND_TEXT[logTint(line)])}>{line.kind}</span>
                        <span className="break-words text-ink-2">{line.text}</span>
                        {line.detail
                          ? <span className={cn('col-start-3 tabular-nums sm:col-start-auto', line.tone === 'bad' ? 'text-bad' : 'text-ok')}>{line.detail}</span>
                          : <span className="hidden sm:block" />}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              </Panel>
            </div>
          )}
        </div>
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
            <dd className="m-0 font-mono text-ink-2">{revealedCount} run · {session ? VERDICT_TEXT[session.verdict] : ''}</dd>
            <dt className="text-ink-3">Suggest</dt>
            <dd className="m-0">
              <ModeToggle label="How to suggest the next test" value={confirmNew ?? 'attack'} onChange={(m) => setConfirmNew(m)} />
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

type LogTint = 'seal' | 'ok' | 'bad' | 'belief';
const logTint = (line: LogLine): LogTint => (line.kind === 'SETUP' ? 'seal' : line.kind === 'UPDATE' ? 'belief' : line.tone === 'bad' ? 'bad' : 'ok');
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

const SEG_ITEM = cn(
  'h-6 gap-1 rounded-full px-2.5 font-mono text-[11.5px] font-medium text-ink-2 hover:bg-primary/8 hover:text-ink [&_svg]:size-3.5 [&_svg]:text-ink-3 hover:[&_svg]:text-primary',
  'aria-pressed:bg-gradient-to-b aria-pressed:from-[#2b6fd3] aria-pressed:to-[#1453ad] aria-pressed:text-white aria-pressed:[&_svg]:text-white',
  'aria-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)]',
  'aria-pressed:hover:from-[#3a7ddd] aria-pressed:hover:to-[#185cbc] aria-pressed:hover:text-white aria-pressed:hover:[&_svg]:text-white',
);
const MODE_LABEL: Record<AttackMode, string> = { attack: 'Likely to fail', learn: 'Informative' };
const MODE_ICON: Record<AttackMode, ReactNode> = { attack: <CrosshairIcon />, learn: <LightbulbIcon /> };

/** Attack / Learn pill segmented control. The active mode is the solid blue pill. */
function ModeToggle({ label, value, onChange, disabled, withHelp }: {
  label: string; value: AttackMode; onChange: (m: AttackMode) => void; disabled?: boolean; withHelp?: boolean;
}) {
  return (
    <ToggleGroup aria-label={label} spacing={1} className="rounded-full bg-ink/[0.05] p-0.5 ring-1 ring-ink/[0.06]"
      value={[value]} onValueChange={(v: string[]) => { if (v[0]) onChange(v[0] as AttackMode); }} disabled={disabled}>
      {(['attack', 'learn'] as const).map((m) => {
        const text = MODE_LABEL[m];
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
