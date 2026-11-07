import { useId } from 'react';
import { blobPathPoints } from './geometry';

export type TestCellGlyphState = 'pending' | 'next' | 'running' | 'survive' | 'fail';

interface TestCellGlyphProps {
  state: TestCellGlyphState;
  size?: number;
}

const FILL: Record<TestCellGlyphState, { membrane: string; tint: string; nucleus: string }> = {
  pending: { membrane: '#9aa0a6', tint: 'rgba(154,160,166,0.12)', nucleus: 'rgba(154,160,166,0.30)' },
  next: { membrane: '#5b3df5', tint: 'rgba(91,61,245,0.12)', nucleus: 'rgba(91,61,245,0.30)' },
  running: { membrane: '#f29b38', tint: 'rgba(242,155,56,0.14)', nucleus: 'rgba(242,155,56,0.32)' },
  survive: { membrane: '#12a36a', tint: 'rgba(18,163,106,0.14)', nucleus: 'rgba(18,163,106,0.32)' },
  fail: { membrane: '#ef4b3f', tint: 'rgba(239,75,63,0.14)', nucleus: 'rgba(239,75,63,0.34)' },
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function TestCellGlyph({ state, size = 40 }: TestCellGlyphProps) {
  const rawId = useId();
  const gradId = `tcg-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = FILL[state];
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const outer = blobPathPoints(cx, cy, r, 1.3, 60)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const inner = blobPathPoints(cx + r * 0.1, cy - r * 0.08, r * 0.36, 3.1, 60, 10)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Test cell: ${state}`}
      data-testid="test-cell-glyph"
      data-state={state}
    >
      <defs>
        <radialGradient id={gradId} cx="58%" cy="44%" r="65%">
          <stop offset="0%" stopColor={c.membrane} stopOpacity="0.35" />
          <stop offset="55%" stopColor={c.membrane} stopOpacity="0.12" />
          <stop offset="100%" stopColor={c.membrane} stopOpacity="0.05" />
        </radialGradient>
      </defs>
      <path d={`${outer} Z`} fill={c.tint} stroke={c.membrane} strokeWidth={1.5} />
      <path d={`${inner} Z`} fill={c.nucleus} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gradId})`} stroke="none" />
      {state === 'next' && !prefersReducedMotion() && (
        <circle cx={cx} cy={cy} r={r - 1} fill="none" stroke={c.membrane} strokeWidth={1.5}>
          <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
