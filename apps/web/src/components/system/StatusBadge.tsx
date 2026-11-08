import type { ComponentProps } from "react";
import { cn } from "cn";

export type Tone = "neutral" | "accent" | "ok" | "bad" | "gap";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  gap: "bg-gap-soft text-gap border-transparent",
};

/** Short state label (max 4 words). Square-ish, never a pill. */
export function StatusBadge({
  tone = "neutral",
  size = "md",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium whitespace-nowrap [&>svg]:size-3.5",
        size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-[12px]",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
