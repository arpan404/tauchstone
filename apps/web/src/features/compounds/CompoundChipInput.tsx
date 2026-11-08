import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Command as CommandPrimitive } from "cmdk";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { normalizeName, useCompoundSearch, type CompoundMatch } from "@/api/mvpHooks";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

const FREE = "__as-typed__";
const STATUS_LABEL: Record<CompoundMatch["status"], string> = {
  ranked: "ranked",
  not_rankable: "not rankable",
  not_in_lincs: "not in LINCS",
};

/** Split a pasted or typed list on commas and newlines. */
function splitNames(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Add names not already present (normalised), keeping order. */
function merge(current: string[], extra: string[]): string[] {
  const seen = new Set(current.map(normalizeName));
  const out = [...current];
  for (const name of extra) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function score(consensus: number): string {
  return `${consensus > 0 ? "+" : ""}${consensus.toFixed(2)}`;
}

/** Fixed position under the field, tracking scroll, resize and the field growing with chips. */
function useDropdownPosition(anchor: React.RefObject<HTMLElement | null>, open: boolean) {
  const [style, setStyle] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!open || !el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const room = window.innerWidth - r.left - 12;
      const width = r.width >= 380 ? r.width : Math.max(r.width, Math.min(420, room));
      const below = window.innerHeight - r.bottom - 16;
      setStyle({ top: r.bottom + 6, left: r.left, width, maxHeight: Math.max(160, Math.min(340, below)) });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, open]);
  return style;
}

/**
 * Searchable multi-select of compound names. Picks become removable chips; pasting a comma or
 * newline list adds each name; free text that matches nothing can still be added as typed.
 */
export function CompoundChipInput({
  names,
  onChange,
  onSubmit,
  label = "Compound names",
}: {
  names: string[];
  onChange: (names: string[]) => void;
  /** Enter on an empty input. */
  onSubmit?: () => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState({ key: "", value: "" });
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const search = useCompoundSearch(query);
  const q = query.trim();
  const fresh = !!search.data && !search.isPlaceholderData;
  const matches = q ? (search.data ?? []) : [];
  const selected = new Set(names.map(normalizeName));
  const exact = fresh && matches.some((m) => normalizeName(m.name) === normalizeName(q));
  const open = focused && q.length > 0;
  const style = useDropdownPosition(field, open);

  // Each new result set highlights its best match (free text when nothing matches);
  // arrow keys and hover move it until the results change.
  const resultKey = `${q}\u0000${matches[0]?.id ?? ""}`;
  const active = picked.key === resultKey ? picked.value : (matches[0]?.id ?? FREE);

  function add(extra: string[]) {
    onChange(merge(names, extra));
    setQuery("");
  }
  function remove(index: number) {
    onChange(names.filter((_, i) => i !== index));
    input.current?.focus();
  }
  function onType(value: string) {
    if (!/[,\n]/.test(value)) return setQuery(value);
    // A typed comma commits everything before it; the tail stays in the input.
    const parts = value.split(/[,\n]/);
    const tail = parts.pop() ?? "";
    onChange(merge(names, parts.map((p) => p.trim()).filter(Boolean)));
    setQuery(tail.trimStart());
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !query && names.length) {
      e.preventDefault();
      onChange(names.slice(0, -1));
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      if (!q) {
        e.preventDefault();
        onSubmit?.();
      } else if (!fresh) {
        // Results still loading: add what was typed instead of a stale match.
        e.preventDefault();
        add([q]);
      }
    }
  }

  return (
    <CommandPrimitive
      shouldFilter={false}
      loop
      label={label}
      value={active}
      onValueChange={(value) => setPicked({ key: resultKey, value })}
      className="relative"
    >
      <div
        ref={field}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
        className={cn(
          "flex min-h-24 cursor-text flex-wrap content-start items-center gap-1.5 rounded-xl bg-frost/70 p-2 ring-1 ring-ink/12 backdrop-blur min-[1400px]:min-h-40",
          focused && "ring-2 ring-primary/45",
        )}
      >
        {names.map((name, i) => (
          <span
            key={`${normalizeName(name)}-${i}`}
            className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full bg-primary/10 pr-0.5 pl-2.5 text-[13px] text-ink ring-1 ring-primary/20"
          >
            <span className="min-w-0 truncate">{name}</span>
            <button
              type="button"
              data-slot="chip-remove"
              aria-label={`Remove ${name}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(i)}
              className="grid size-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-primary/15 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none"
            >
              <XIcon aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <CommandPrimitive.Input
          ref={input}
          data-slot="compound-search-input"
          value={query}
          onValueChange={onType}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!/[,\n]/.test(text)) return;
            e.preventDefault();
            add(splitNames(`${query}${text}`));
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={names.length ? "Add compound" : "Search compound, brand or synonym"}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-[13.5px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {open &&
        createPortal(
          <div
            data-slot="popover-content"
            style={style}
            // Keep focus in the input while clicking a row.
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-50 flex flex-col overflow-hidden rounded-xl p-1 text-sm text-ink shadow-overlay"
          >
            <CommandList className="max-h-none min-h-0 flex-1">
              {matches.length > 0 && (
                <CommandGroup heading="Matches" className={cn(!fresh && "opacity-60")}>
                  {matches.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      data-checked={selected.has(normalizeName(m.name))}
                      onSelect={() => add([m.name])}
                      className="gap-2 rounded-lg py-1.5 data-selected:bg-primary/8"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{m.name}</span>
                        {m.matched_alias && (
                          <span className="block truncate text-[11.5px] text-ink-3">{m.matched_alias}</span>
                        )}
                      </span>
                      {m.status === "ranked" ? (
                        <>
                          <span className="shrink-0 font-mono text-[11px] whitespace-nowrap text-ink-3 tabular-nums">
                            {m.pool_rank != null
                              ? `#${m.pool_rank.toLocaleString("en-US")}`
                              : "ranked"}
                          </span>
                          <span
                            className={cn(
                              "w-12 shrink-0 text-right font-mono text-[12px] tabular-nums",
                              m.consensus != null && m.consensus < 0 ? "text-primary" : "text-ink-2",
                            )}
                          >
                            {m.consensus != null ? score(m.consensus) : ""}
                          </span>
                        </>
                      ) : (
                        <span className="shrink-0 text-[11.5px] whitespace-nowrap text-ink-3">
                          {STATUS_LABEL[m.status]}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!exact && (
                <CommandGroup heading={fresh && !matches.length ? "No match" : undefined}>
                  <CommandItem
                    value={FREE}
                    onSelect={() => add([q])}
                    className="gap-2 rounded-lg py-1.5 data-selected:bg-primary/8"
                  >
                    <PlusIcon aria-hidden className="text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">
                      Add <span className="font-medium text-ink">{q}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-3">as typed</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </div>,
          document.body,
        )}
    </CommandPrimitive>
  );
}
