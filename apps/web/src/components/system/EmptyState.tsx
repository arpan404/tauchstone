import type { ReactNode } from "react";
import { cn } from "cn";

/** One line and one action. No paragraphs. */
export function EmptyState({
  icon,
  title,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface/60 p-8 text-center",
        className,
      )}
    >
      {icon && <div className="text-ink-3 [&>svg]:size-6">{icon}</div>}
      <p className="m-0 text-[14px] font-medium text-ink-2">{title}</p>
      {action}
    </div>
  );
}
