import type { Schema } from "@/api/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "./StatusBadge";

type Approval = Schema<"ApprovalStatus"> | null | undefined;

const MAX_COUNTRIES = 3;
const split = (s?: string) => (s ? s.split(";").map((x) => x.trim()).filter(Boolean) : []);

function withdrawnLabel(a: Approval) {
  return a?.withdrawn_year ? `withdrawn ${a.withdrawn_year}` : "withdrawn";
}

/** Bad-tone badge when ChEMBL marks the drug withdrawn. Renders nothing otherwise. */
export function WithdrawnBadge({ approval, size = "md", className }: { approval: Approval; size?: "sm" | "md"; className?: string }) {
  if (!approval?.withdrawn) return null;
  const classes = split(approval.withdrawn_class);
  const countries = split(approval.withdrawn_country);
  const shown = countries.slice(0, MAX_COUNTRIES).join(", ");
  const more = countries.length > MAX_COUNTRIES ? ` +${countries.length - MAX_COUNTRIES}` : "";
  return (
    <Tooltip>
      <TooltipTrigger
        render={<StatusBadge tone="bad" size={size} tabIndex={0} className={className} />}
        aria-label={`${withdrawnLabel(approval)}${classes.length ? `, ${classes.join(", ")}` : ""}`}
      >
        {withdrawnLabel(approval)}
      </TooltipTrigger>
      <TooltipContent className="max-w-72 flex-col items-start gap-0.5 text-left leading-snug">
        <span>{classes.length ? classes.join(", ") : "Class unspecified"}</span>
        <span>{countries.length ? `${shown}${more}` : "Country unspecified"}</span>
        <span className="opacity-70">{approval.withdrawn_source ?? "ChEMBL 37"}</span>
      </TooltipContent>
    </Tooltip>
  );
}
