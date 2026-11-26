import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOpenAlertsIfAny } from '../state/OpenAlerts';
import { Icon } from './Icon';

/**
 * The top of a page, under the console's top bar: the way back, if there is one, above the
 * title; the title on the left with a line or two under it; and the page's actions on the
 * right of the title, as in most admin consoles. It scrolls with the page: the top bar
 * above it stays, so the search and the Live status are always in reach.
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
  /** The page's buttons, at the right of the title. */
  actions?: ReactNode;
  /** Small marks beside the title, such as "View only". */
  titleAddon?: ReactNode;
  /** A line or two under the title. */
  children?: ReactNode;
}) {
  useTabTitle(title);

  return (
    <header className="page-head">
      {back ? (
        <Link className="page-head__back" to={back.to}>
          <Icon name="chevronLeft" />
          {back.label}
        </Link>
      ) : null}
      <div className="page-head__row">
        <div className="page-title">
          <h1>
            {title}
            {titleAddon}
          </h1>
          {children}
        </div>
        {actions ? <div className="page-head__actions">{actions}</div> : null}
      </div>
    </header>
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
