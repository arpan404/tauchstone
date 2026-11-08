import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { badgeTip } from "./badgeTips";

export type Tone = "neutral" | "accent" | "ok" | "bad" | "gap";

const TONES: Record<Tone, string> = {
  neutral: "bg-white/80 text-ink-2 border-ink/10",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  ok: "bg-ok/10 text-ok border-transparent",
  bad: "bg-bad/10 text-bad border-transparent",
  gap: "bg-gap/10 text-gap border-transparent",
};

/** Visible text of a node tree (icons contribute nothing). */
function textOf(node: ReactNode): string {
  let out = "";
  Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number") out += String(child);
    else if (isValidElement<{ children?: ReactNode }>(child)) out += textOf(child.props.children);
  });
  return out;
}

/**
 * Short state label (max 4 words), pill shaped. Every badge explains itself on hover: pass
 * `tip`, or the label is looked up in the badge glossary (badgeTips.ts). `tip={false}` opts out.
 */
export function StatusBadge({
  tone = "neutral",
  size = "md",
  tip,
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone; size?: "sm" | "md"; tip?: ReactNode | false }) {
  const badge = (
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
  // Already the trigger of someone else's tooltip (e.g. WithdrawnBadge): don't nest a second one.
  const ownTrigger = Boolean(props.onPointerEnter || props.onMouseEnter || props.onFocus || props["aria-describedby"]);
  const meaning = tip === false || ownTrigger ? null : (tip ?? badgeTip(textOf(props.children)));
  if (!meaning) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={badge} className="cursor-help" />
      <TooltipContent className="max-w-72 text-left leading-snug">{meaning}</TooltipContent>
    </Tooltip>
  );
}
