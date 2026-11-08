import type { ReactNode } from "react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY, type GlossaryKey } from "./glossary";

/** A label with a dotted underline and a short definition on hover or focus. */
export function Term({
  term,
  tip,
  children,
  className,
  focusable = true,
}: {
  /** False when the term sits inside another control (button, toggle). */
  focusable?: boolean;
  term?: GlossaryKey;
  tip?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const content = tip ?? (term ? GLOSSARY[term] : null);
  if (!content) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={focusable ? 0 : undefined} />}
        className={cn(
          "cursor-help rounded-sm underline decoration-line-strong decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left leading-snug">{content}</TooltipContent>
    </Tooltip>
  );
}
