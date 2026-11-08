import { useId } from 'react';
import { GLYPH_COLORS } from './glyphColors';

export type { TestCellState } from './glyphColors';

// Irregular closed blob in a 40x40 box (cubic segments), so the glyph reads as a cell.
const MEMBRANE = 'M20 3.6c6.6-.2 12.9 3.4 15 9.6 2.2 6.4.4 13.9-4.6 18.2-4.8 4.2-12.3 6-18 3.3C6.6 32 3 25.8 3.4 19.4 3.8 12 8 6.3 13.4 4.5c2.1-.7 4.3-.9 6.6-.9z';
const NUCLEUS = 'M23.2 13.6c3 .3 5.2 3 5 6.1-.2 3.2-2.9 5.9-6.2 5.8-3.2-.1-5.6-2.8-5.4-6 .2-3.3 3.3-6.2 6.6-5.9z';

const STYLE = `
@keyframes tsg-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.07);opacity:.82}}
@keyframes tsg-spin{to{transform:rotate(360deg)}}
@keyframes tsg-ring{0%{transform:scale(.92);opacity:.55}100%{transform:scale(1.28);opacity:0}}
.tsg-pulse{animation:tsg-pulse 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.tsg-ring{animation:tsg-ring 1.6s ease-out infinite;transform-box:fill-box;transform-origin:center}
.tsg-spin{animation:tsg-spin 2.4s linear infinite;transform-box:view-box;transform-origin:20px 20px}
@media (prefers-reduced-motion: reduce){.tsg-pulse,.tsg-ring,.tsg-spin{animation:none}}
`;

/** Small blob cell for a hidden test: grey pending, blue pulsing next, amber running, green survive, coral fail. */
export function TestCellGlyph(props: { state: 'pending' | 'next' | 'running' | 'survive' | 'fail'; size?: number }) {
  const { state, size = 40 } = props;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const c = GLYPH_COLORS[state];
  const pending = state === 'pending';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={state}
      data-state={state}
      data-testid="test-cell-glyph"
      style={{ overflow: 'visible', flex: 'none' }}
    >
      <style>{STYLE}</style>
      <defs>
        <radialGradient id={`${id}-fill`} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.6" stopColor={c} stopOpacity={pending ? 0.08 : 0.12} />
          <stop offset="1" stopColor={c} stopOpacity={pending ? 0.16 : 0.26} />
        </radialGradient>
      </defs>
      {state === 'next' && <path className="tsg-ring" d={MEMBRANE} fill="none" stroke={c} strokeWidth="1.5" />}
      {state === 'survive' && <path d={MEMBRANE} fill="none" stroke={c} strokeOpacity="0.28" strokeWidth="5" />}
      <g className={state === 'next' ? 'tsg-pulse' : undefined}>
        <path d={MEMBRANE} fill={`url(#${id}-fill)`} stroke={c} strokeOpacity={pending ? 0.55 : 0.85} strokeWidth="1.6" strokeDasharray={pending ? '2.4 2.2' : undefined} />
        <circle cx="11.5" cy="21" r="1.6" fill={c} fillOpacity="0.35" />
        <ellipse cx="15" cy="28" rx="3" ry="1.3" transform="rotate(-25 15 28)" fill={c} fillOpacity="0.25" />
        <path d={NUCLEUS} fill={c} fillOpacity={pending ? 0.22 : 0.34} stroke={c} strokeOpacity="0.5" strokeWidth="0.9" />
        <circle cx="24" cy="18.5" r="1.5" fill={c} fillOpacity="0.55" />
      </g>
      {state === 'running' && (
        <g className="tsg-spin">
          <circle cx="20" cy="20" r="18.6" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeDasharray="10 7" />
        </g>
      )}
      {state === 'fail' && (
        <path d="M14.5 14.5l11 11M25.5 14.5l-11 11" stroke={c} strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {state === 'survive' && (
        <path d="M14 20.5l4 4 8-9" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
      )}
    </svg>
  );
}
