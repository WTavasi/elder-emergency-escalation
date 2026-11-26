import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** What the person chose: the device's own setting, or light or dark whatever it says. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'mzazicare.theme';
const DARK = '(prefers-color-scheme: dark)';

/** A per-browser convenience, so it lives in localStorage and survives being blocked. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Puts the choice on the page. The design tokens already follow the device unless the root
 * element says `data-theme="light"` or `"dark"`, so this sets that attribute, or removes it
 * to follow the device again. Called before the first render as well, so a dark choice
 * never flashes light while the console loads.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  root.style.colorScheme = choice === 'system' ? '' : choice;
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(DARK).matches ?? false);
}

// One choice for the whole page, so the switch in the top bar and the account menu agree.
let current: ThemeChoice | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = (): ThemeChoice => (current ??= readThemeChoice());

function setChoice(next: ThemeChoice): void {
  current = next;
  applyThemeChoice(next);
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Remembered for this page only.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Light or dark, chosen in the top bar and remembered in this browser. `dark` is what is on
 * screen now, whichever way it was decided, so the switch can offer the other one.
 */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, snapshot, () => 'system' as ThemeChoice);
  const [systemDark, setSystemDark] = useState(systemIsDark);

  useEffect(() => {
    const query = window.matchMedia?.(DARK);
    if (!query) return;
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const choose = useCallback((next: ThemeChoice) => setChoice(next), []);
  const dark = choice === 'dark' || (choice === 'system' && systemDark);
  return { choice, dark, choose };
}
