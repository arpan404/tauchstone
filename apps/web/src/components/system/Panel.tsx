import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";

/** The only container in the app: hairline border, no shadow. */
export function Panel({
  title,
  actions,
  flush = false,
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  actions?: ReactNode;
  /** No inner padding (tables, plots that bleed to the edge). */
  flush?: boolean;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-lg border border-line bg-surface", className)}
      {...props}
    >
      {(title || actions) && (
        <header className="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2">
          {title && <h3 className="text-[13px] font-semibold text-ink">{title}</h3>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}
