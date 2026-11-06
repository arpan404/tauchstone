import { describe, expect, it } from 'vitest';
import { fmt2, hasIntervalWidth, observedText } from './format';

describe('outcome formatting', () => {
  it('formats long decimals to 2 places', () => {
    expect(fmt2(0.16590164851619668)).toBe('0.17');
    expect(fmt2(-2.386)).toBe('-2.39');
    expect(fmt2(null)).toBe('—');
    expect(fmt2(undefined)).toBe('—');
  });

  it('omits the threshold clause for rank-based (null threshold) rules', () => {
    expect(observedText(0.16590164851619668, null)).toBe('Observed consensus 0.17');
    expect(observedText(-2.386, -1.8)).toBe('Observed -2.39 vs threshold -1.80');
    expect(observedText(null, null)).toBe('Observed consensus —');
  });

  it('hides zero-width engine intervals', () => {
    expect(hasIntervalWidth([0.24, 0.24])).toBe(false);
    expect(hasIntervalWidth([0.24, 0.243])).toBe(false);
    expect(hasIntervalWidth([0.5, 0.73])).toBe(true);
    expect(hasIntervalWidth(undefined)).toBe(false);
    expect(hasIntervalWidth([0.5])).toBe(false);
  });
});
