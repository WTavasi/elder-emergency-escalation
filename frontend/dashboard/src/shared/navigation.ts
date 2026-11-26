import type { IconName } from './components/Icon';

/**
 * The console's sections, in the sidebar's order. Each has a key for the keyboard: G,
 * then that key, goes there from anywhere, as in Gmail and GitHub.
 */
export const SECTIONS: { to: string; label: string; icon: IconName; key: string }[] = [
  { to: '/', label: 'Open emergencies', icon: 'emergency', key: 'b' },
  { to: '/history', label: 'History', icon: 'history', key: 'h' },
  { to: '/reporting', label: 'Reporting', icon: 'reporting', key: 'r' },
  { to: '/users', label: 'Users', icon: 'people', key: 'u' },
  { to: '/volunteers', label: 'Volunteers', icon: 'personAdd', key: 'v' },
  { to: '/policy', label: 'Escalation policy', icon: 'tune', key: 'p' },
];

/** ⌘ on a Mac, Ctrl elsewhere, as each platform's own shortcuts are written. */
export function commandKey(): string {
  const platform =
    typeof navigator === 'undefined' ? '' : `${navigator.platform} ${navigator.userAgent}`;
  return /Mac|iPhone|iPad/.test(platform) ? '⌘' : 'Ctrl ';
}

/** Whether a key press is someone typing, which a single-letter shortcut must leave alone. */
export function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) ||
    target.closest('[role="dialog"], [role="alertdialog"]') !== null
  );
}
