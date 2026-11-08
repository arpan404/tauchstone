/** Fixed scale so reversal bars stay comparable across filters and views. */
export const REVERSAL_SCALE = 2.5;

const NEURAL = /^(NEU|SHSY5Y|MNEU|NPC|FIBRNPC)/;
export const isNeural = (cellId: string) => NEURAL.test(cellId);

export const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Dot tone for an exposure label. The label text itself is always shown verbatim. */
export function exposureTone(label: string | undefined, penetrant?: boolean | null) {
  if (penetrant === true || /penetrant|high/i.test(label ?? "")) return "bg-ok";
  if (penetrant === false || /low|none/i.test(label ?? "")) return "bg-bad";
  return "bg-ink-3";
}
