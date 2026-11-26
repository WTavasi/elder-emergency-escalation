import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useOpenAlerts } from '../state/OpenAlerts';
import { ShellContext } from '../state/Shell';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { PrivacyPanel } from '../../features/privacy/PrivacyPanel';
import { humanise } from '../utils/format';
import { commandKey, SECTIONS, typing } from '../navigation';
import { CommandPalette } from './CommandPalette';
import { Icon } from './Icon';
import { LiveStatus } from './parts';

/** How long after G the second key of a "go to" shortcut is waited for. */
const SECOND_KEY_MS = 1200;

const COLLAPSED_KEY = 'mzazicare.sidebar.collapsed';

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
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // Remembered for this page only.
  }
}

/**
 * The window every signed-in screen sits in, after a Mac app such as Mail or System
 * Settings: a sidebar of sections on the left, in grey, and the page beside it.
 *
 * The button at its top collapses the sidebar to a narrow rail of icons, each named on
 * hover and to a screen reader, with the open count on its icon, and expands it again; on
 * a phone it is a drawer behind a button in the page's bar instead. Who is
 * signed in sits at its foot, as an account does in System Settings. There is no bar
 * across the top of the window: each page carries its own (see PageHeader), with its
 * title and its actions, so nothing is said twice.
 */
export function Layout() {
  const { alerts, connection, health, down, updatedAt } = useOpenAlerts();
  const openCount = alerts?.length ?? null;
  const location = useLocation();
  const narrow = useMediaQuery(NARROW);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const rail = !narrow && collapsed;
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

  // One search across the console, on ⌘K (Ctrl K elsewhere) from anywhere, and the "go
  // to" shortcuts: G, then a section's key, when nobody is typing.
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    let awaiting = 0;
    const onKey = (keyEvent: KeyboardEvent) => {
      const key = keyEvent.key.toLowerCase();
      if (key === 'k' && (keyEvent.metaKey || keyEvent.ctrlKey) && !keyEvent.altKey) {
        // Not over another sheet or panel: one thing on top of the page at a time.
        const other = document.querySelector(
          '[role="dialog"]:not(.palette__box), [role="alertdialog"]',
        );
        if (other) return;
        keyEvent.preventDefault();
        setSearching((was) => !was);
        return;
      }
      if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey || typing(keyEvent.target)) {
        return;
      }
      if (awaiting && Date.now() - awaiting < SECOND_KEY_MS) {
        awaiting = 0;
        const section = SECTIONS.find((candidate) => candidate.key === key);
        if (section) {
          keyEvent.preventDefault();
          void navigate(section.to);
        }
        return;
      }
      awaiting = key === 'g' ? Date.now() : 0;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  function toggle() {
    if (narrow) {
      setDrawerFor(null);
      return;
    }
    setCollapsed(!collapsed);
    writeCollapsed(!collapsed);
  }

  const shell = useMemo(
    () => ({
      // On a computer the sidebar is always there, wide or as a rail, so the page's bar
      // needs no button for it; on a phone the drawer opens from there.
      sidebarShown: narrow ? drawerOpen : true,
      showSidebar: () => {
        if (narrow) setDrawerFor(location.pathname);
      },
    }),
    [narrow, drawerOpen, location.pathname],
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className={`shell${rail ? ' shell--rail' : ''}`}>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>

        {drawerOpen ? (
          <div className="scrim" aria-hidden="true" onClick={() => setDrawerFor(null)} />
        ) : null}

        <aside id="sidebar" className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`}>
          <div className="sidebar__top">
            {rail ? null : (
              <Link to="/" className="sidebar__brand">
                MzaziCare
              </Link>
            )}
            <button
              type="button"
              className="icon-button button--quiet"
              onClick={toggle}
              aria-controls="sidebar"
              aria-expanded={!rail}
              title={narrow ? undefined : rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
            >
              <Icon
                name="sidebar"
                label={
                  narrow
                    ? 'Close the sidebar'
                    : rail
                      ? 'Expand the sidebar'
                      : 'Collapse the sidebar'
                }
              />
            </button>
          </div>

          {/* An icon beside each section's name, never instead of it. */}
          <nav className="nav" aria-label="Sections">
            {SECTIONS.map((section) => {
              const count = section.to === '/' ? openCount : null;
              return (
                <NavLink
                  key={section.to}
                  to={section.to}
                  end={section.to === '/'}
                  // On the rail the name is hidden from sight but still read out; the tooltip
                  // says it to a mouse.
                  title={rail ? section.label : undefined}
                >
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
        </aside>

        {/*
          The bar across the top of every page: the search across the console on the left;
          whether the console is live, and who is signed in, on the right. On a phone it
          also holds the button for the sidebar's drawer.
        */}
        <div className="workspace">
          <header className="topbar">
            {narrow ? (
              <button
                type="button"
                className="icon-button button--quiet"
                onClick={() => setDrawerFor(location.pathname)}
                aria-controls="sidebar"
                aria-expanded={drawerOpen}
              >
                <Icon name="sidebar" label="Show the sidebar" />
              </button>
            ) : null}
            <button
              type="button"
              className="topbar__search"
              onClick={() => setSearching(true)}
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Icon name="search" size={18} />
              <span className="topbar__search-text">Search</span>
              <kbd className="topbar__kbd">{commandKey()}K</kbd>
            </button>
            <div className="topbar__end">
              <LiveStatus
                state={connection}
                health={health}
                down={down}
                updatedAt={updatedAt}
                onRetry={() => window.location.reload()}
              />
              <AccountMenu compact={narrow} />
            </div>
          </header>

          <main className="main" id="main">
            <Outlet />
          </main>
        </div>

        {searching ? <CommandPalette onClose={() => setSearching(false)} /> : null}
      </div>
    </ShellContext.Provider>
  );
}

/**
 * Who is signed in, and signing out, at the right of the top bar. Sign out sits inside the
 * menu rather than on the page, so it is never pressed on the way to something else. On a
 * phone only the initials show.
 */
function AccountMenu({ compact }: { compact: boolean }) {
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
        <div className="menu menu--right" role="menu">
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
        aria-label={compact ? `${session.user.name}, ${humanise(session.user.role)}` : undefined}
        title={compact ? session.user.name : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="account__mark" aria-hidden="true">
          {initials(session.user.name)}
        </span>
        {compact ? null : (
          <>
            <span className="account__who">
              <span className="account__name">{session.user.name}</span>
              <span className="account__role">{humanise(session.user.role)}</span>
            </span>
            <Icon name="unfold" size={18} />
          </>
        )}
      </button>
      {privacy ? <PrivacyPanel signedIn onClose={() => setPrivacy(false)} /> : null}
    </div>
  );
}
