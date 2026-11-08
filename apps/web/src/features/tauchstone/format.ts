/** Format a revealed outcome value to 2 decimals; 'n/a' when absent. */
export function fmt2(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return x.toFixed(2);
}

/**
 * One-line observed text for a revealed outcome.
 * Rank-based rules carry a null threshold: show the consensus without 'vs threshold'.
 */
export function observedText(value: number | null | undefined, threshold: number | null | undefined): string {
  if (threshold === null || threshold === undefined) {
    return `Observed consensus ${fmt2(value)}`;
  }
  return `Observed ${fmt2(value)} vs threshold ${fmt2(threshold)}`;
}

/** Hide the belief interval when it is effectively zero-width (not a real band). */
export function hasIntervalWidth(interval: readonly number[] | null | undefined, minWidth = 0.005): boolean {
  if (!interval || interval.length < 2) return false;
  return interval[1] - interval[0] >= minWidth;
}

/** A budget readout counts tests, including the singular final test. */
export function testsLeftText(count: number): string {
  return `${count} ${count === 1 ? 'test' : 'tests'} left`;
}
