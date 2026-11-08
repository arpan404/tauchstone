import type { ComponentProps } from "react";
import { cn } from "cn";

export type Tone = "neutral" | "accent" | "ok" | "bad" | "gap";

const TONES: Record<Tone, string> = {
  neutral: "bg-white/80 text-ink-2 border-ink/10",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  ok: "bg-ok/10 text-ok border-transparent",
  bad: "bg-bad/10 text-bad border-transparent",
  gap: "bg-gap/10 text-gap border-transparent",
};

/** Short state label (max 4 words), pill shaped. */
export function StatusBadge({
  tone = "neutral",
  size = "md",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap [&>svg]:size-3.5",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
