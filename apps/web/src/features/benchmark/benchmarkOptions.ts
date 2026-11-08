import type { Schema } from '@/api/types';

type Tests = Pick<Schema<'Benchmark'>, 'tests'>['tests'];

/** Co-primary policies named in the preregistration. */
export const CO_PRIMARY = ['tauchstone_hybrid', 'decision_lookahead_hybrid'] as const;

/** Short display name and an optional qualifier for each benchmark policy id. */
export const POLICY_NAMES: Record<string, { name: string; detail?: string }> = {
  tauchstone_hybrid: { name: 'Tauchstone' },
  decision_lookahead_hybrid: { name: 'Decision-aware' },
  random: { name: 'Random' },
  greedy_strongest: { name: 'Confirmation', detail: 'greedy strongest' },
  max_failure: { name: 'Attack', detail: 'max failure' },
  max_uncertainty: { name: 'Max uncertainty' },
  expected_decision_change: { name: 'Learn', detail: 'expected decision change' },
};

/** Display labels for benchmark policies (API sends raw ids as labels). */
export const POLICY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(POLICY_NAMES).map(([id, p]) => [id, p.detail ? `${p.name} (${p.detail})` : p.name]),
);

export function policyName(id: string): string {
  return POLICY_NAMES[id]?.name ?? id.replaceAll('_', ' ');
}

/** Compact metric names for the pairwise table. */
export function metricLabel(metric: string): string {
  const descriptive = metric.endsWith('_head_to_head_descriptive');
  const base = descriptive ? metric.replace('_head_to_head_descriptive', '') : metric;
  const name =
    base === 'experiments_to_correct_verdict'
      ? 'experiments to verdict'
      : base === 'decision_accuracy'
        ? 'decision accuracy'
        : base.replaceAll('_', ' ');
  return descriptive ? `${name}, descriptive` : name;
}

/** Holm p for a policy pair, either direction; decision_accuracy first. */
export function pairHolmP(tests: Tests, a: string, b: string): number | null {
  const pair = tests.filter(
    (t) => (t.policy_a === a && t.policy_b === b) || (t.policy_a === b && t.policy_b === a),
  );
  const pick = pair.find((t) => t.metric === 'decision_accuracy') ?? pair[0];
  return pick ? pick.p_holm : null;
}

/** Metric the headline p-values were computed on (for the badge label). */
export function pairMetric(tests: Tests, a: string, b: string): string | null {
  const pair = tests.filter(
    (t) => (t.policy_a === a && t.policy_b === b) || (t.policy_a === b && t.policy_b === a),
  );
  const pick = pair.find((t) => t.metric === 'decision_accuracy') ?? pair[0];
  return pick ? pick.metric : null;
}

export function formatP(p: number | null | undefined): string {
  return p === null || p === undefined || !Number.isFinite(p) ? 'n/a' : p.toPrecision(3);
}

/** Axis domain and ticks for an interval plot; snaps outward to `step`. */
export function niceDomain(values: number[], step: number, floor?: number, ceil?: number) {
  const finite = values.filter(Number.isFinite);
  const lo = floor ?? Math.floor((Math.min(...finite) - 1e-9) / step) * step;
  const hi = ceil ?? Math.ceil((Math.max(...finite) + 1e-9) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { domain: [lo, hi] as [number, number], ticks };
}

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Calibration / reliability plot: predicted vs observed with the diagonal. Colours from tokens. */
export function buildCalibrationOption(
  bins: { mean_predicted: number; observed_rate: number; n?: number }[],
): Record<string, unknown> {
  const ink3 = token('--ink-3', '#6B7080');
  const line = token('--line', '#E2E4E9');
  const accent = token('--primary', '#1558B8');
  const axis = {
    type: 'value',
    min: 0,
    max: 1,
    interval: 0.25,
    nameLocation: 'middle',
    nameTextStyle: { color: ink3, fontSize: 11 },
    axisLabel: { color: ink3, fontSize: 10, fontFamily: 'Geist Mono Variable, monospace' },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: line } },
  };
  return {
    textStyle: { color: ink3, fontFamily: 'Instrument Sans Variable, sans-serif' },
    legend: { show: false },
    grid: { left: 48, right: 12, top: 12, bottom: 36 },
    xAxis: { ...axis, name: 'predicted', nameGap: 22 },
    yAxis: { ...axis, name: 'observed', nameGap: 34 },
    tooltip: {
      trigger: 'item',
      formatter: (p: { data?: number[] }) =>
        p.data ? `predicted ${p.data[0]?.toFixed(2)}<br/>observed ${p.data[1]?.toFixed(2)}` : '',
    },
    series: [
      {
        type: 'line',
        name: 'ideal',
        data: [
          [0, 0],
          [1, 1],
        ],
        lineStyle: { color: ink3, type: 'dashed', width: 1, opacity: 0.6 },
        symbol: 'none',
        silent: true,
      },
      {
        type: 'scatter',
        name: 'bins',
        data: bins.map((b) => [b.mean_predicted, b.observed_rate]),
        symbolSize: 9,
        itemStyle: { color: accent },
      },
    ],
  };
}
