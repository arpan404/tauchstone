import { DesktopIcon, MoonIcon, SunIcon, type Icon } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setThemePref, useIsDark, useThemePref, type ThemePref } from "./theme";

const OPTIONS: [ThemePref, string, Icon][] = [
  ["light", "Light", SunIcon],
  ["dark", "Dark", MoonIcon],
  ["system", "Match system", DesktopIcon],
];

/** Light / dark / system switch for the top bar. */
export function ThemeToggle() {
  const pref = useThemePref();
  const dark = useIsDark();
  const Current = dark ? MoonIcon : SunIcon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${OPTIONS.find(([v]) => v === pref)?.[1] ?? "Light"}`}
        className="grid size-8 shrink-0 place-items-center rounded-full border border-rim/90 bg-frost/75 text-ink-3 shadow-[0_1px_2px_rgb(15_24_48/0.05)] backdrop-blur hover:bg-frost hover:text-primary"
      >
        <Current className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={pref} onValueChange={(v) => setThemePref(v as ThemePref)}>
            {OPTIONS.map(([value, label, I]) => (
              <DropdownMenuRadioItem key={value} value={value} className="gap-2">
                <I className="size-4 text-ink-3" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
