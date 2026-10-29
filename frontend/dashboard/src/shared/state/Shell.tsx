import { createContext, useContext } from 'react';

interface ShellValue {
  /** Whether the sidebar is on screen: a column on a desktop, the drawer on a phone. */
  sidebarShown: boolean;
  /** Brings it back, or opens the drawer. */
  showSidebar: () => void;
}

/**
 * What a page needs to know about the window around it. Outside the window, in a test
 * that renders one page on its own, the sidebar counts as shown, so no page offers a
 * button that would do nothing.
 */
export const ShellContext = createContext<ShellValue>({
  sidebarShown: true,
  showSidebar: () => undefined,
});

export function useShell(): ShellValue {
  return useContext(ShellContext);
}
