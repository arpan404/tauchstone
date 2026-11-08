import { useState } from "react";
import { CaretUpDownIcon, CheckIcon, PillIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useProjectCandidates } from "@/api/mvpHooks";
import { useCandidates } from "@/api/hooks";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUi } from "@/store/ui";

/**
 * Pick the drug under investigation from any page. Lists the current project's ranked pool
 * (top 500 by reversal), searchable by name or BRD id.
 */
export function CandidatePicker({
  variant = "bar",
  onPicked,
  className,
}: {
  /** "bar": compact chip for the top bar. "button": larger trigger for empty states. */
  variant?: "bar" | "button";
  onPicked?: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { selectedCandidateId, selectCandidate, currentProjectId } = useUi();
  const project = useProjectCandidates(currentProjectId ?? "GSE132903", { limit: 500 });
  const frozen = useCandidates();
  const list = project.data?.candidates ?? frozen.data?.candidates ?? [];
  const selected =
    list.find((c) => c.id === selectedCandidateId) ??
    frozen.data?.candidates.find((c) => c.id === selectedCandidateId);
  const label = selected?.name ?? selectedCandidateId ?? "Choose drug";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={selectedCandidateId ? `Selected candidate ${label}` : "Choose drug"}
        className={cn(
          variant === "bar"
            ? "flex h-8 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1.5 text-[13px] hover:border-line-strong"
            : "flex h-10 min-w-64 items-center gap-2.5 rounded-md border border-line-strong bg-surface px-3 text-[14px] hover:border-primary",
          className,
        )}
      >
        <PillIcon
          weight="fill"
          className={cn("shrink-0 rounded-full bg-accent-soft p-0.5 text-primary", variant === "bar" ? "size-5" : "size-6")}
        />
        <span className={cn("max-w-44 truncate", selected || selectedCandidateId ? "font-medium text-ink" : "text-ink-3")}>
          {label}
        </span>
        {selected && typeof selected.consensus === "number" && (
          <span className="font-mono text-[12px] text-ink-3">
            #{selected.rank} <span className="text-primary">{selected.consensus.toFixed(2)}</span>
          </span>
        )}
        <CaretUpDownIcon className="ml-auto size-4 shrink-0 text-ink-3" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 shadow-overlay">
        <Command filter={(value, search) => (value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search drug or BRD id" />
          <CommandList className="max-h-80">
            <CommandEmpty>No matching drug</CommandEmpty>
            <CommandGroup heading={`Ranked pool · ${list.length.toLocaleString("en-US")} shown`}>
              {list.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.id}`}
                  onSelect={() => {
                    selectCandidate(c.id);
                    setOpen(false);
                    onPicked?.(c.id);
                  }}
                  className="gap-2"
                >
                  <span className="w-9 shrink-0 font-mono text-[11px] text-ink-3">#{c.rank}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-[12px] text-primary">{typeof c.consensus === "number" ? c.consensus.toFixed(2) : ""}</span>
                  <CheckIcon
                    className={cn("size-3.5 shrink-0", c.id === selectedCandidateId ? "text-primary" : "invisible")}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
