import type { ComponentProps } from "react";
import { cn } from "cn";

/** Filters and actions above a table or panel. */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)} {...props} />;
}
