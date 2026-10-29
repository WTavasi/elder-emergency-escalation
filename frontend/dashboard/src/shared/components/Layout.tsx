import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useOpenAlerts } from '../state/OpenAlerts';
import { ShellContext } from '../state/Shell';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { PrivacyPanel } from '../../features/privacy/PrivacyPanel';
import { humanise } from '../utils/format';
import { Icon, type IconName } from './Icon';

const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Open emergencies', icon: 'emergency' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/reporting', label: 'Reporting', icon: 'reporting' },
  { to: '/users', label: 'Users', icon: 'people' },
  { to: '/volunteers', label: 'Volunteers', icon: 'personAdd' },
];

const HIDDEN_KEY = 'mzazicare.sidebar.hidden';

/** Where the sidebar becomes a drawer behind a button rather than a column. */
const NARROW = '(max-width: 860px)';

/** Up to two initials, for the account mark. Never a photo: the console stores none. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0)?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';
  return (first + last || '?').toUpperCase();
}

/** A per-browser convenience, so it lives in localStorage and survives being blocked. */
function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    localStorage.setItem(HIDDEN_KEY, String(hidden));
  } catch {
    // Remembered for this page only.
  }
}

/**
 * The window every signed-in screen sits in, after a Mac app such as Mail or System
 * Settings: a sidebar of sections on the left, in grey, and the page beside it.
 *
 * The sidebar can be hidden with the button at its top, which then appears in the page's
 * own bar to bring it back; on a phone it is a drawer behind that button instead. Who is
 * signed in sits at its foot, as an account does in System Settings. There is no bar
 * across the top of the window: each page carries its own (see PageHeader), with its
 * title and its actions, so nothing is said twice.
 */
export function Layout() {
  const { alerts } = useOpenAlerts();
  const openCount = alerts?.length ?? null;
  const location = useLocation();
  const narrow = useMediaQuery(NARROW);
  const [hidden, setHidden] = useState(readHidden);
  // The drawer is open for the page it was opened on, so moving to another page closes
  // it: a drawer still open after choosing where to go is in the way of where you went.
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawerOpen = narrow && drawerFor === location.pathname;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setDrawerFor(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  function hide() {
    if (narrow) {
      setDrawerFor(null);
      return;
    }
    setHidden(true);
    writeHidden(true);
  }

  const shell = useMemo(
    () => ({
      sidebarShown: narrow ? drawerOpen : !hidden,
      showSidebar: () => {
        if (narrow) {
          setDrawerFor(location.pathname);
          return;
        }
        setHidden(false);
        writeHidden(false);
      },
    }),
    [narrow, drawerOpen, hidden, location.pathname],
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className={`shell${!narrow && hidden ? ' shell--sidebar-hidden' : ''}`}>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        {drawerOpen ? (
          <div className="scrim" aria-hidden="true" onClick={() => setDrawerFor(null)} />
        ) : null}

        <aside id="sidebar" className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`}>
          <div className="sidebar__top">
            <Link to="/" className="sidebar__brand">
              MzaziCare
            </Link>
            <button
              type="button"
              className="icon-button button--quiet"
              onClick={hide}
              aria-controls="sidebar"
              aria-expanded={true}
            >
              <Icon name="sidebar" label={narrow ? 'Close the sidebar' : 'Hide the sidebar'} />
            </button>
          </div>

          {/* An icon beside each section's name, never instead of it. */}
          <nav className="nav" aria-label="Sections">
            {SECTIONS.map((section) => {
              const count = section.to === '/' ? openCount : null;
              return (
                <NavLink key={section.to} to={section.to} end={section.to === '/'}>
                  <Icon name={section.icon} size={18} />
                  <span className="nav__text">{section.label}</span>
                  {count ? (
                    <span className="nav__count" aria-label={`${count} open`}>
                      {count}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <AccountMenu />
        </aside>

        <main className="main" id="main">
          <Outlet />
        </main>
      </div>
    </ShellContext.Provider>
  );
}

/**
 * Who is signed in, and signing out, at the foot of the sidebar. Sign out sits inside the
 * menu rather than on the page, so it is never pressed on the way to something else.
 */
function AccountMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (pointerEvent: MouseEvent) => {
      if (!box.current?.contains(pointerEvent.target as Node)) setOpen(false);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session) return null;

  return (
    <div className="account" ref={box}>
      {open ? (
        <div className="menu menu--up" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPrivacy(true);
            }}
          >
            <Icon name="privacy" size={18} />
            Privacy and data
          </button>
          <button type="button" role="menuitem" onClick={() => void signOut()}>
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="account__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="account__mark" aria-hidden="true">
          {initials(session.user.name)}
        </span>
        <span className="account__who">
          <span className="account__name">{session.user.name}</span>
          <span className="account__role">{humanise(session.user.role)}</span>
        </span>
        <Icon name="unfold" size={18} />
      </button>
      {privacy ? <PrivacyPanel signedIn onClose={() => setPrivacy(false)} /> : null}
    </div>
  );
}
