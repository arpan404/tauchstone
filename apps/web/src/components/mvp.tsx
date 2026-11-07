import type { ComponentProps } from "react";
export function Chip({
  tone = "",
  className = "",
  ...props
}: ComponentProps<"span"> & { tone?: "" | "gap" | "bad" | "ok" | "accent" }) {
  return <span className={`mvp-chip ${tone} ${className}`} {...props} />;
}
export function Action({
  secondary = false,
  className = "",
  ...props
}: ComponentProps<"button"> & { secondary?: boolean }) {
  return (
    <button
      className={`mvp-button ${secondary ? "secondary" : ""} ${className}`}
      {...props}
    />
  );
}
