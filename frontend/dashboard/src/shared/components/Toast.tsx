import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

/** How long a confirmation stays before it goes by itself. */
const CONFIRMATION_MS = 8000;

/**
 * What an action did, floating at the foot of the window over the page, so saying it
 * never pushes the page down. A confirmation goes by itself after a few seconds, but not
 * while the pointer or focus is on it; a failure stays until it is closed, as it needs
 * reading. Either can be closed at once.
 */
export function Toast({
  message,
  tone = 'done',
  onClose,
}: {
  message: string;
  tone?: 'done' | 'failed';
  onClose: () => void;
}) {
  const close = useRef(onClose);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  const start = () => {
    window.clearTimeout(timer.current);
    if (tone === 'done') timer.current = window.setTimeout(() => close.current(), CONFIRMATION_MS);
  };
  const pause = () => window.clearTimeout(timer.current);

  // A new message starts the time again.
  useEffect(() => {
    if (tone !== 'done') return;
    timer.current = window.setTimeout(() => close.current(), CONFIRMATION_MS);
    return () => window.clearTimeout(timer.current);
  }, [message, tone]);

  return (
    <div
      className={`toast${tone === 'failed' ? ' toast--failed' : ''}`}
      role={tone === 'failed' ? 'alert' : 'status'}
      onPointerEnter={pause}
      onPointerLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <Icon name={tone === 'failed' ? 'elevated' : 'check'} size={18} />
      <span className="toast__text">{message}</span>
      <button type="button" className="icon-button button--quiet" onClick={onClose}>
        <Icon name="close" label="Dismiss" size={16} />
      </button>
    </div>
  );
}
