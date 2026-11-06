import { useRunExperiment, useStartAttack, useMockStatus } from '@/api/hooks';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { VerdictBadge, contextIcon } from '@/components/labels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useUi } from '@/store/ui';
import ReactECharts from 'echarts-for-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { beliefPoints, buildBeliefOption } from './beliefOption';
import { fmt2, hasIntervalWidth, observedText } from './format';

type Session = Schema<'AttackSession'>;

function BudgetPips({ budget, remaining, hidden }: { budget: number; remaining: number; hidden: number }) {
  const testsLeft = Math.min(remaining, hidden);
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`Budget ${remaining} of ${budget}; ${hidden} hidden contexts; ${testsLeft} tests left`}
    >
      {Array.from({ length: testsLeft }, (_, i) => (
        <span key={i} aria-hidden className="inline-block h-3 w-3 rounded-full bg-teal-700" />
      ))}
      <span className="ml-1 text-sm tabular-nums text-neutral-600">{testsLeft} tests left</span>
    </div>
  );
}

export function AttackView() {
  const { selectedCandidateId, mode, setMode, sessionId, setSessionId } = useUi();
  const [session, setSession] = useState<Session | null>(null);
  const mockData = useMockStatus(session?.history?.[session.history.length - 1]?.provenance ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const [recommendationNote, setRecommendationNote] = useState<string | null>(null);
  const prevRecommended = useRef<string | null>(null);
  const start = useStartAttack();
  const run = useRunExperiment(session?.session_id ?? null);

  const effectivePicked = picked ?? session?.recommended_context_id ?? null;
  const hiddenCount = session ? session.contexts.filter((c) => c.status === 'hidden').length : 0;
  const beliefChart = useMemo(
    () => buildBeliefOption(beliefPoints(session?.history ?? [])),
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
    if (!selectedCandidateId) return;
    setRecommendationNote(null);
    prevRecommended.current = null;
    setPicked(null);
    start.mutate(
      { candidateId: selectedCandidateId, mode, budget: 5 },
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
    if (!effectivePicked) return;
    const before = session;
    run.mutate(
      { contextId: effectivePicked, mode },
      {
        onSuccess: (s) => {
          setSession(s);
          setPicked(null);
          void before;
        },
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      {(mockData || session) && (
        <div className="sticky top-0 z-10 bg-[#fafaf9]">
          <MockRibbon show={mockData} />
          {session && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-200 py-2">
              <p className="text-sm text-neutral-600">
                P(claim){' '}
                <span className="text-2xl font-semibold tabular-nums text-teal-900" aria-live="polite">
                  {session.belief.p_claim_holds.toFixed(2)}
                </span>{' '}
                {hasIntervalWidth(session.belief.interval) && (
                  <span className="text-xs tabular-nums text-neutral-500">
                    [{fmt2(session.belief.interval?.[0])}, {fmt2(session.belief.interval?.[1])}]
                  </span>
                )}
              </p>
              <VerdictBadge verdict={session.verdict} size="sm" />
              <BudgetPips
                budget={session.budget}
                remaining={session.budget_remaining}
                hidden={hiddenCount}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <span className={mode !== 'learn' ? 'font-semibold' : 'text-neutral-500'}>Attack</span>
                <Switch
                  checked={mode === 'learn'}
                  onCheckedChange={(v) => setMode(v ? 'learn' : 'attack')}
                  aria-label="Toggle attack or learn mode (sticky header)"
                />
                <span className={mode === 'learn' ? 'font-semibold' : 'text-neutral-500'}>Learn</span>
              </label>
              <Button
                size="sm"
                onClick={handleRun}
                disabled={!effectivePicked || run.isPending || session.budget_remaining <= 0}
              >
                {run.isPending ? 'Running…' : 'Run validation'}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h2 className="text-xl font-semibold">Attack the claim</h2>
          <label className="flex items-center gap-2 text-sm">
            <span className={! (mode === 'learn') ? 'font-semibold' : 'text-neutral-500'}>Attack</span>
            <Switch
              checked={mode === 'learn'}
              onCheckedChange={(v) => setMode(v ? 'learn' : 'attack')}
              aria-label="Toggle attack or learn mode"
            />
            <span className={mode === 'learn' ? 'font-semibold' : 'text-neutral-500'}>Learn</span>
          </label>
          <p className="w-full text-xs text-neutral-500">
            {mode === 'attack'
              ? 'Attack: run the validation most likely to break the claim.'
              : 'Learn: run the validation expected to change belief the most.'}
          </p>
        </div>

        {!session && (
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              {!selectedCandidateId ? (
                <p className="text-neutral-500">
                  Select a candidate in step 2 first, then start an attack session here.
                </p>
              ) : (
                <>
                  <p>
                    Candidate <span className="font-mono">{selectedCandidateId}</span> · Mode:{' '}
                    <span className="font-medium">{mode}</span> · Budget: 5
                  </p>
                  <Button onClick={handleStart} disabled={start.isPending}>
                    {start.isPending ? 'Starting…' : 'Start attack session'}
                  </Button>
                  {start.isError && (
                    <p role="alert" className="text-red-700">
                      Could not start the session.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {session && (
          <>
            <Card>
              <CardContent className="space-y-3 pt-4">
                <p className="text-sm text-neutral-600" aria-label="Claim under test">
                  Claim: “{session.claim.text}”
                </p>
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <p className="text-xs text-neutral-500">P(claim holds)</p>
                    <p className="text-5xl font-semibold tabular-nums text-teal-900" aria-live="polite">
                      {session.belief.p_claim_holds.toFixed(2)}
                    </p>
                    {hasIntervalWidth(session.belief.interval) && (
                      <p className="text-xs tabular-nums text-neutral-500">
                        90% interval [{fmt2(session.belief.interval?.[0])}, {fmt2(session.belief.interval?.[1])}]
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <VerdictBadge verdict={session.verdict} />
                    <BudgetPips
                      budget={session.budget}
                      remaining={session.budget_remaining}
                      hidden={hiddenCount}
                    />
                  </div>
                </div>
                <div className="w-full" role="img" aria-label="P(claim holds) across reveals">
                  <ReactECharts option={beliefChart} style={{ height: 150 }} />
                </div>
                {recommendationNote && (
                  <p role="status" className="rounded border border-teal-700/30 bg-teal-50 px-3 py-1.5 text-sm text-teal-950">
                    {recommendationNote}
                  </p>
                )}
              </CardContent>
            </Card>

            {lastRevealed && (
              <Card
                key={session.history?.length ?? 0}
                className={`motion-safe:animate-[reveal_.5s_ease-out] ${lastRevealed.outcome === 'survive' ? 'border-teal-600' : 'border-amber-500'}`}
              >
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium">
                    {lastRevealed.outcome === 'survive' ? (
                      <span className="text-teal-800">✓ Survived — {lastRevealed.label}</span>
                    ) : (
                      <span className="text-amber-800">✗ Failed — {lastRevealed.label}</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm tabular-nums">
                  <p>
                    {observedText(lastRevealed.value, lastRevealed.threshold)} · {lastRevealed.rule}
                  </p>
                  <p className="text-neutral-600">
                    Belief {lastRevealed.belief_before.toFixed(3)} →{' '}
                    <span className="font-semibold">{lastRevealed.belief_after.toFixed(3)}</span>
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Hidden validation contexts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {session.contexts.map((c) => {
                  const isRec = c.context_id === session.recommended_context_id && c.status === 'hidden';
                  const isPicked = c.context_id === effectivePicked;
                  return (
                    <button
                      key={c.context_id}
                      disabled={c.status === 'revealed'}
                      onClick={() => setPicked(c.context_id)}
                      aria-pressed={isPicked}
                      className={`flex w-full items-center gap-3 rounded border px-3 py-2 text-left text-sm tabular-nums disabled:cursor-default disabled:opacity-60 ${
                        isRec
                          ? 'border-teal-700 bg-teal-50/60'
                          : isPicked
                            ? 'border-neutral-500 bg-neutral-50'
                            : 'border-neutral-200'
                      }`}
                    >
                      <span aria-hidden className="text-base">{contextIcon(c.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.label}</span>
                        <span className="block text-xs text-neutral-500">
                          {c.status === 'revealed'
                            ? `revealed: ${c.outcome}`
                            : `p(survive) ${(c.p_survive ?? 0).toFixed(2)} · acquisition ${(c.acquisition ?? 0).toFixed(2)}`}
                        </span>
                      </span>
                      {isRec && (
                        <span className="shrink-0 rounded-full bg-teal-700 px-2 py-0.5 text-xs text-white">
                          recommended
                        </span>
                      )}
                    </button>
                  );
                })}
                {session.recommended_context_id && (
                  <p className="text-xs text-neutral-500">Rationale: {session.rationale}</p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    onClick={handleRun}
                    disabled={!effectivePicked || run.isPending || session.budget_remaining <= 0}
                  >
                    {run.isPending ? 'Running…' : 'Run validation'}
                  </Button>
                  {run.isError && (
                    <p role="alert" className="text-sm text-red-700">
                      That context cannot be run (already revealed or budget exhausted).
                    </p>
                  )}
                  {session.budget_remaining <= 0 && (
                    <p className="text-sm text-neutral-500">Budget exhausted — session complete.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {(session.history?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">History</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-1 text-sm tabular-nums">
                    {session.history!.map((h) => (
                      <li key={h.context_id} className="flex flex-wrap gap-x-3 border-b border-neutral-100 py-1">
                        <span aria-hidden>{h.outcome === 'survive' ? '✓' : '✗'}</span>
                        <span className="font-medium">{h.label}</span>
                        <span className="text-neutral-500">
                          {h.outcome} · {observedText(h.value, h.threshold)} · {h.belief_before.toFixed(2)} →{' '}
                          {h.belief_after.toFixed(2)} · mode {h.mode_used ?? session.mode}
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setSession(null);
                  setSessionId(null);
                  setPicked(null);
                  setRecommendationNote(null);
                  prevRecommended.current = null;
                }}
              >
                Restart attack
              </Button>
              {sessionId !== session.session_id && <Skeleton className="h-9 w-24" />}
            </div>
          </>
        )}
      </div>
      <ProvenanceStrip
        provenance={session?.history?.[session.history.length - 1]?.provenance}
      />
    </div>
  );
}
