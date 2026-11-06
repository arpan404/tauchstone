import { describe, expect, it } from 'vitest';
import { beliefPoints, buildBeliefOption } from './beliefOption';

describe('belief chart helpers', () => {
  it('builds a start point plus one point per reveal', () => {
    const history = [
      { belief_before: 0.62, belief_after: 0.5 },
      { belief_before: 0.5, belief_after: 0.58 },
    ];
    const pts = beliefPoints(history as never);
    expect(pts).toEqual([
      { step: 0, p: 0.62 },
      { step: 1, p: 0.5 },
      { step: 2, p: 0.58 },
    ]);
  });

  it('returns an empty series with no history', () => {
    const opt = buildBeliefOption([]) as { series: { data: unknown[] }[] };
    expect(opt.series[0].data).toEqual([]);
  });
});
