import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";

/** Must match the pre-paint script in index.html. */
export const THEME_KEY = "ts-theme";
const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? (media().matches ? "dark" : "light") : pref;
}

export function applyTheme(pref: ThemePref = readPref()) {
  const dark = resolveTheme(pref) === "dark";
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode: still apply for this session */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = media();
  const onSystem = () => {
    if (readPref() === "system") applyTheme("system");
    onChange();
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onSystem);
  };
}

/** Stored preference (light by default, the signed-off expo look). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "light");
}

function subscribeClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** True while the dark palette is applied; re-renders canvas-drawn views on change. */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeClass,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}
