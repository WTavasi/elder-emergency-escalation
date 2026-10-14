import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * A dialog over the page: a title, its contents, and its buttons along the bottom.
 *
 * Escape closes it, focus moves into it when it opens and back to whatever opened it
 * when it closes, and Tab stays inside it, which is what a screen reader user needs to
 * know they are somewhere else. The page behind is dimmed but not blurred.
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
  wide = false,
  side = false,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  wide?: boolean;
  /**
   * A panel along the right edge, full height, instead of a box in the middle: for
   * detail that sits beside the page rather than interrupting it.
   */
  side?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        box.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();

    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        close.current();
        return;
      }
      if (keyEvent.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (keyEvent.shiftKey && document.activeElement === first) {
        keyEvent.preventDefault();
        last.focus();
      } else if (!keyEvent.shiftKey && document.activeElement === last) {
        keyEvent.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div className={`modal${side ? ' modal--side' : ''}`}>
      <div className="modal__scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={box}
        className={`modal__box${wide ? ' modal__box--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button button--quiet" onClick={onClose}>
            <Icon name="close" label="Close" />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__foot">{footer}</div>
      </div>
    </div>
  );
}
