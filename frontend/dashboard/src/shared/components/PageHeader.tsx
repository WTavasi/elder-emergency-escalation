import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOpenAlertsIfAny } from '../state/OpenAlerts';
import { useShell } from '../state/Shell';
import { Icon } from './Icon';

/**
 * The top of a page, as an iPad or Mac app draws it: a slim bar that stays put as the page
 * scrolls, holding the way back and the page's actions, and the page's title large
 * underneath. Once the large title has scrolled away, a small copy of it appears in the
 * middle of the bar, so you never lose track of where you are.
 *
 * It also names the browser tab, with the number of emergencies waiting for an answer in
 * front, so a console left in a background tab still says when somebody is needed.
 */
export function PageHeader({
  title,
  back,
  actions,
  titleAddon,
  children,
}: {
  title: string;
  /** A way back to the list this page came from: "‹ Open emergencies". */
  back?: { to: string; label: string };
  /** The page's buttons, at the right of the bar. */
  actions?: ReactNode;
  /** Small marks beside the title, such as "View only". */
  titleAddon?: ReactNode;
  /** A line or two under the title. */
  children?: ReactNode;
}) {
  const { sidebarShown, showSidebar } = useShell();
  const heading = useRef<HTMLHeadingElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const target = heading.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(entry ? !entry.isIntersecting : false),
      // The bar's own height, so the small title appears as the large one slides under it.
      { rootMargin: '-52px 0px 0px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useTabTitle(title);

  return (
    <>
      <div className={`pagebar${scrolled ? ' pagebar--scrolled' : ''}`}>
        <div className="pagebar__lead">
          {!sidebarShown ? (
            <button
              type="button"
              className="icon-button button--quiet"
              onClick={showSidebar}
              aria-controls="sidebar"
              aria-expanded={false}
            >
              <Icon name="sidebar" label="Show the sidebar" />
            </button>
          ) : null}
          {back ? (
            <Link className="pagebar__back" to={back.to}>
              <Icon name="chevronLeft" />
              {back.label}
            </Link>
          ) : null}
        </div>
        <span className="pagebar__title" aria-hidden="true">
          {title}
        </span>
        <div className="pagebar__actions">{actions}</div>
      </div>
      <header className="page-title">
        <h1 ref={heading}>
          {title}
          {titleAddon}
        </h1>
        {children}
      </header>
    </>
  );
}

/** "(2) Users — MzaziCare": the page, and how many are waiting for an answer. */
function useTabTitle(title: string): void {
  const board = useOpenAlertsIfAny();
  const waiting = board?.alerts?.filter((alert) => !alert.acknowledgedBy).length ?? 0;
  useEffect(() => {
    document.title = `${waiting > 0 ? `(${waiting}) ` : ''}${title} — MzaziCare`;
  }, [title, waiting]);
}
