import { useEffect, type RefObject } from 'react';

/**
 * Command-F, or Ctrl+F, puts the cursor in the page's search, as it does in Mail and
 * Finder. Pressed again while the cursor is already there, it is left to the browser, so
 * finding words on the page still works. Not while a sheet is open over the page.
 */
export function useFindShortcut(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key.toLowerCase() !== 'f' || !(keyEvent.metaKey || keyEvent.ctrlKey)) return;
      if (keyEvent.shiftKey || keyEvent.altKey) return;
      const field = input.current;
      if (!field || document.activeElement === field) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      keyEvent.preventDefault();
      field.focus();
      field.select();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [input]);
}
