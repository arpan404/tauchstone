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
        "glass flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
    >
      {icon && <div className="grid size-11 place-items-center rounded-full bg-accent-soft text-primary [&>svg]:size-5">{icon}</div>}
      <p className="m-0 text-[14px] font-medium text-ink-2">{title}</p>
      {action}
    </div>
  );
}
