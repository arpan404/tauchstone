import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/system";

const TONE: Record<string, Tone> = { "": "neutral", gap: "gap", bad: "bad", ok: "ok", accent: "accent" };

/** Legacy alias: renders the system StatusBadge. */
export function Chip({
  tone = "",
  ...props
}: ComponentProps<"span"> & { tone?: "" | "gap" | "bad" | "ok" | "accent" }) {
  return <StatusBadge tone={TONE[tone]} {...props} />;
}
/** Legacy alias: renders the system Button. */
export function Action({
  secondary = false,
  ...props
}: ComponentProps<"button"> & { secondary?: boolean }) {
  return <Button variant={secondary ? "outline" : "default"} {...(props as object)} />;
}
