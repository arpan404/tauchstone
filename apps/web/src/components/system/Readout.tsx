import type { ReactNode } from "react";
import { cn } from "cn";
import type { Tone } from "./StatusBadge";

const SIZES = {
  sm: "text-[15px]",
  md: "text-[22px]",
  lg: "text-[32px]",
  xl: "text-[44px] leading-none",
} as const;
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  accent: "text-primary",
  ok: "text-ok",
  bad: "text-bad",
  gap: "text-gap",
};

/** Labelled instrument value. The value is always mono with tabular figures. */
export function Readout({
  label,
  value,
  unit,
  size = "md",
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  size?: keyof typeof SIZES;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cn("m-0 font-mono font-medium tracking-tight tabular-nums", SIZES[size], TONE_TEXT[tone])}>
        {value}
        {unit && <span className="ml-1 text-[0.5em] font-normal text-ink-3">{unit}</span>}
      </dd>
    </div>
  );
}
