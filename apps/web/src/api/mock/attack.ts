import type { components } from '../schema';
import { getMockCandidate, MOCK_THETA } from './candidates';
import { MOCK_SEED, roundTo, streamFor } from './prng';

type AttackSession = components['schemas']['AttackSession'];
type RunResult = components['schemas']['RunResult'];
type ContextState = components['schemas']['ContextState'];
type RevealedOutcome = components['schemas']['RevealedOutcome'];
type Mode = components['schemas']['Mode'];
type Verdict = components['schemas']['Verdict'];

interface HiddenOutcome {
  survive: boolean;
  value: number | null;
  threshold: number | null;
}

interface SessionRecord {
  session: AttackSession;
  hidden: Map<string, HiddenOutcome>;
}

const CONTEXT_DEFS: {
  context_id: string;
  type: ContextState['type'];
  label: string;
  rule: string;
}[] = [
  {
    context_id: 'ctx-gse173955',
    type: 'held_out_cohort',
    label: 'GSE173955 hippocampus (RNA-seq)',
    rule: 'Survives if the candidate ranks in the top 5% of reversal scores in this held-out cohort.',
  },
  {
    context_id: 'ctx-gse53697',
    type: 'held_out_cohort',
    label: 'GSE53697 prefrontal cortex (RNA-seq)',
    rule: 'Survives if the candidate ranks in the top 5% of reversal scores in this held-out cohort.',
  },
  {
    context_id: 'ctx-composition',
    type: 'composition_adjusted',
    label: 'GSE132903 composition-adjusted signature',
    rule: 'Survives if the candidate ranks in the top 5% after cell-composition adjustment.',
  },
  {
    context_id: 'ctx-mcf7',
    type: 'lincs_context',
    label: 'MCF7 · 10 uM · 24 h (held-out)',
    rule: 'Survives if the held-out LINCS consensus is at or below θ (−1.00); negative = reversal.',
  },
  {
    context_id: 'ctx-vcap',
    type: 'lincs_context',
    label: 'VCAP · 10 uM · 24 h (held-out)',
    rule: 'Survives if the held-out LINCS consensus is at or below θ (−1.00); negative = reversal.',
  },
  {
    context_id: 'ctx-bbb',
    type: 'brain_exposure',
    label: 'Measured CNS exposure',
    rule: 'Survives if measured brain exposure meets the predefined CNS threshold.',
  },
];

let sessionCounter = 0;
const sessions = new Map<string, SessionRecord>();

export function verdictFor(p: number): Verdict {
  if (p < 0.3) return 'INSUFFICIENT_EVIDENCE';
  if (p < 0.55) return 'FRAGILE_CONTEXT_DEPENDENT';
  return 'SUPPORTED_SO_FAR';
}

export function verdictLabel(v: Verdict): string {
  if (v === 'SUPPORTED_SO_FAR') return 'Supported so far';
  if (v === 'FRAGILE_CONTEXT_DEPENDENT') return 'Fragile / context-dependent';
  return 'Insufficient evidence';
}

function acquisitionFor(mode: Mode, pSurvive: number): number {
  if (mode === 'attack') return roundTo(1 - pSurvive, 4);
  // learn: largest expected belief change ≈ highest uncertainty.
  return roundTo(1 - Math.abs(pSurvive - 0.5) * 2, 4);
}

function pickRecommended(contexts: ContextState[]): { id: string | null; rationale: string } {
  const hiddenList = contexts.filter((c) => c.status === 'hidden');
  if (hiddenList.length === 0) return { id: null, rationale: 'No hidden contexts remain.' };
  const best = hiddenList.reduce((a, b) => ((b.acquisition ?? 0) > (a.acquisition ?? 0) ? b : a));
  return { id: best.context_id, rationale: rationaleFor(best) };
}

/** Rationale references only public info (p_survive, mode) — never the hidden outcome. */
export function rationaleFor(ctx: ContextState, mode?: Mode): string {
  const m = mode ?? 'attack';
  if (m === 'attack') {
    return `${ctx.label}: lowest predicted survival (p = ${ctx.p_survive.toFixed(2)}) — the test most likely to break the claim.`;
  }
  return `${ctx.label}: highest uncertainty (p = ${ctx.p_survive.toFixed(2)}) — the test expected to move belief most.`;
}

function publicContexts(rec: SessionRecord): ContextState[] {
  // Strip hidden outcomes: only id/label/type/status/p_survive/acquisition leave the mock.
  return rec.session.contexts.map((c) => ({
    context_id: c.context_id,
    type: c.type,
    label: c.label,
    status: c.status,
    p_survive: c.p_survive,
    acquisition: c.status === 'hidden' ? c.acquisition : null,
    outcome: c.status === 'revealed' ? c.outcome : null,
  }));
}

function refreshRecommendation(rec: SessionRecord, mode: Mode): void {
  for (const c of rec.session.contexts) {
    if (c.status === 'hidden') c.acquisition = acquisitionFor(mode, c.p_survive);
    else c.acquisition = null;
  }
  const { id } = pickRecommended(rec.session.contexts);
  rec.session.recommended_context_id = id;
  const target = rec.session.contexts.find((c) => c.context_id === id);
  rec.session.rationale = target
    ? rationaleFor(
        {
          context_id: target.context_id,
          type: target.type,
          label: target.label,
          status: target.status,
          p_survive: target.p_survive,
        },
        mode,
      )
    : 'All contexts revealed.';
}

export function startMockAttack(candidateId: string, mode: Mode = 'attack', budget = 5): AttackSession {
  const candidate = getMockCandidate(candidateId);
  sessionCounter += 1;
  const sessionId = `mock-session-${sessionCounter}`;
  const rng = streamFor(`attack:${candidateId}:${sessionCounter}`);

  // Hidden truth table: lives ONLY inside this module, never returned wholesale.
  const hidden = new Map<string, HiddenOutcome>();
  const strength = Math.min(1, Math.max(0, (-candidate.consensus - 0.4) / 2.2));
  const contexts: ContextState[] = CONTEXT_DEFS.map((d) => {
    const pSurvive = roundTo(0.3 + strength * 0.55 + (rng() - 0.5) * 0.25, 3);
    const clamped = Math.min(0.94, Math.max(0.08, pSurvive));
    const survive = rng() < clamped;
    let value: number | null = null;
    let threshold: number | null = null;
    if (d.type === 'lincs_context') {
      threshold = MOCK_THETA;
      value = roundTo(survive ? MOCK_THETA - rng() * 0.9 : MOCK_THETA + 0.15 + rng() * 1.1, 3);
    } else if (d.type === 'brain_exposure') {
      threshold = 0.5;
      value = roundTo(survive ? 0.55 + rng() * 0.4 : 0.05 + rng() * 0.4, 3);
    } else {
      // Rank-percentile style value: lower is better; survives at ≤ 0.05.
      threshold = 0.05;
      value = roundTo(survive ? rng() * 0.045 : 0.06 + rng() * 0.5, 4);
    }
    hidden.set(d.context_id, { survive, value, threshold });
    return {
      context_id: d.context_id,
      type: d.type,
      label: d.label,
      status: 'hidden',
      p_survive: clamped,
      acquisition: acquisitionFor(mode, clamped),
      outcome: null,
    };
  });

  const record: SessionRecord = {
    session: {
      session_id: sessionId,
      candidate_id: candidate.id,
      candidate_name: candidate.name,
      mode,
      budget,
      budget_remaining: budget,
      claim: {
        text: `${candidate.name} reverses the AD signature in at least 70% of predefined validation contexts`,
        q: 0.7,
        theta: MOCK_THETA,
        n_contexts: CONTEXT_DEFS.length,
      },
      belief: { p_claim_holds: 0.62, interval: [0.5, 0.73] },
      verdict: 'SUPPORTED_SO_FAR',
      contexts,
      recommended_context_id: null,
      rationale: '',
      history: [],
    },
    hidden,
  };
  refreshRecommendation(record, mode);
  sessions.set(sessionId, record);
  return { ...record.session, contexts: publicContexts(record), history: [] };
}

export function runMockExperiment(
  sessionId: string,
  contextId: string,
  nextMode?: Mode,
): RunResult {
  const rec = sessions.get(sessionId);
  if (!rec) throw new Error(`Unknown attack session: ${sessionId}`);
  const s = rec.session;
  if (s.budget_remaining <= 0) {
    const err = new Error('Budget exhausted for this attack session.');
    (err as { status?: number }).status = 409;
    throw err;
  }
  const ctx = s.contexts.find((c) => c.context_id === contextId);
  if (!ctx) {
    const err = new Error(`Unknown context for this candidate: ${contextId}`);
    (err as { status?: number }).status = 409;
    throw err;
  }
  if (ctx.status === 'revealed') {
    const err = new Error(`Context already revealed: ${contextId}`);
    (err as { status?: number }).status = 409;
    throw err;
  }
  const truth = rec.hidden.get(contextId);
  if (!truth) throw new Error(`No hidden outcome for context: ${contextId}`);

  const modeUsed = s.mode;
  const beliefBefore = s.belief.p_claim_holds;
  const beliefAfter = truth.survive
    ? roundTo(beliefBefore + (1 - beliefBefore) * 0.18, 4)
    : roundTo(Math.max(0.02, beliefBefore - beliefBefore * 0.35), 4);

  const def = CONTEXT_DEFS.find((d) => d.context_id === contextId);
  const revealed: RevealedOutcome = {
    context_id: ctx.context_id,
    type: ctx.type,
    label: ctx.label,
    outcome: truth.survive ? 'survive' : 'fail',
    value: truth.value,
    threshold: truth.threshold,
    rule: def ? def.rule : 'Predefined survive rule for this context type.',
    detail: truth.survive
      ? `Observed ${truth.value} vs threshold ${truth.threshold}: claim survives this context.`
      : `Observed ${truth.value} vs threshold ${truth.threshold}: claim fails this context.`,
    belief_before: beliefBefore,
    belief_after: beliefAfter,
    mode_used: modeUsed,
    provenance: {
      dataset_accession: 'held-out validation contexts (mock)',
      processing_version: 'mock-0.1.0',
      git_commit: 'mock',
      timestamp: '2026-11-05T00:00:00Z',
      random_seed: MOCK_SEED,
      validation_context: contextId,
    },
  };

  ctx.status = 'revealed';
  ctx.outcome = revealed.outcome;
  ctx.acquisition = null;
  s.budget_remaining -= 1;
  s.belief = {
    p_claim_holds: beliefAfter,
    interval: [
      roundTo(Math.max(0, beliefAfter - 0.08 + s.history!.length * 0.005), 3),
      roundTo(Math.min(1, beliefAfter + 0.08 - s.history!.length * 0.005), 3),
    ],
  };
  s.verdict = verdictFor(beliefAfter);
  s.history = [...(s.history ?? []), revealed];
  if (nextMode && nextMode !== s.mode) s.mode = nextMode;
  refreshRecommendation(rec, s.mode);

  const done = s.budget_remaining <= 0 || s.contexts.every((c) => c.status === 'revealed');
  return { ...s, contexts: publicContexts(rec), history: s.history, revealed, done };
}

/** For tests: clear all sessions and reset the counter. */
export function resetMockAttack(): void {
  sessions.clear();
  sessionCounter = 0;
}
