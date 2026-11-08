import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";

/** Frosted floating panel: the only container. Title row has an optional icon chip and actions. */
export function Panel({
  title,
  icon,
  caption,
  actions,
  flush = false,
  className,
  bodyClassName,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  /** Phosphor icon element shown in a soft chip before the title. */
  icon?: ReactNode;
  /** Short muted line under the title (a label, not a sentence about the UI). */
  caption?: ReactNode;
  actions?: ReactNode;
  /** No inner padding (tables, plots that bleed to the edge). */
  flush?: boolean;
  /** Classes for the body wrapper, e.g. "flex-1" to fill a column. */
  bodyClassName?: string;
}) {
  return (
    <section className={cn("glass min-w-0", className)} {...props}>
      {(title || actions) && (
        <header className="flex min-h-12 items-start gap-3 px-5 pt-4 pb-1">
          {icon && (
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-primary [&>svg]:size-4">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && <h3 className="m-0 text-[15px] font-medium tracking-[-0.01em] text-ink [font-stretch:100%]">{title}</h3>}
            {caption && <p className="m-0 mt-0.5 text-[12px] text-ink-3">{caption}</p>}
          </div>
          {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(flush ? "" : "px-5 pt-3 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}
