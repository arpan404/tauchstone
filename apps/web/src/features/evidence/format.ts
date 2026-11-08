/** Number formatting shared by the Drug view. */

/** Signed value with a typographic minus, e.g. −1.79. */
export function signed(value: number, digits = 2): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `−${text}` : text;
}

export function int(value: number): string {
  return value.toLocaleString("en-US");
}

/** LINCS neural lines (ranking contexts). Matches the API's neural_cells list. */
export const NEURAL_LINE = /^(NEU|SHSY5Y|MNEU|NPC|FIBRNPC)/;

export function doseLabel(dose: string): string {
  return dose.replace("uM", "µM");
}

/** Heat colour for a consensus score: reversal (negative) in the accent, mimicry in neutral grey. */
export function heat(consensus: number): { background: string; strong: boolean } {
  const t = Math.min(1, Math.abs(consensus) / 3);
  if (consensus < 0) {
    const pct = Math.round(12 + t * 76);
    return {
      background: `color-mix(in oklch, var(--primary) ${pct}%, var(--surface))`,
      strong: pct >= 50,
    };
  }
  const pct = Math.round(10 + t * 40);
  return {
    background: `color-mix(in oklch, var(--ink-3) ${pct}%, var(--surface))`,
    strong: false,
  };
}
