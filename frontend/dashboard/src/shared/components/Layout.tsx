import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { CrumbProvider, useCurrentCrumb } from '../state/Breadcrumb';
import { useOpenAlerts } from '../state/OpenAlerts';
import { PrivacyPanel } from '../../features/privacy/PrivacyPanel';
import { humanise } from '../utils/format';
import { Icon, type IconName } from './Icon';

const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Open emergencies', icon: 'emergency' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/reporting', label: 'Reporting', icon: 'reporting' },
  { to: '/users', label: 'Users', icon: 'people' },
];

const COLLAPSED_KEY = 'mzazicare.sidebar.collapsed';

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
 * The frame every signed-in screen sits in.
 *
 * A sidebar of sections that can be narrowed to its icons on a desktop and becomes a
 * drawer behind a menu button on a phone, and a header that stays put while the page
 * scrolls, with where you are and who you are signed in as. Nothing else goes in the
 * header: the open count is already on the first section, and there is no search that
 * spans the whole console, so a bell or a global search box would be decoration.
 */
export function Layout() {
  return (
    <CrumbProvider>
      <Frame />
    </CrumbProvider>
  );
}

function Frame() {
  const { alerts } = useOpenAlerts();
  const openCount = alerts?.length ?? null;
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // The drawer is open for the page it was opened on, so moving to another page closes
  // it: a drawer still open after choosing where to go is in the way of where you went.
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawerOpen = drawerFor === location.pathname;
  const setDrawerOpen = (open: boolean) => setDrawerFor(open ? location.pathname : null);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setDrawerFor(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    setCollapsed((was) => {
      writeCollapsed(!was);
      return !was;
    });
  }

  return (
    <div className={`shell${collapsed ? ' shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      {drawerOpen ? (
        <div className="scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      ) : null}

      <aside id="sidebar" className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__top">
          <Link to="/" className="sidebar__brand">
            {collapsed ? 'M' : 'MzaziCare'}
          </Link>
          <button
            type="button"
            className="icon-button sidebar__close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <Icon name="close" />
          </button>
        </div>

        {/*
          An icon beside each section name, never instead of it. Narrowed to icons, each
          link keeps its name for a screen reader and as a tooltip.
        */}
        <nav className="nav" aria-label="Sections">
          {SECTIONS.map((section) => {
            const count = section.to === '/' ? openCount : null;
            return (
              <NavLink
                key={section.to}
                to={section.to}
                end={section.to === '/'}
                title={collapsed ? section.label : undefined}
              >
                <span className="nav__label">
                  <Icon name={section.icon} />
                  <span className="nav__text">{section.label}</span>
                </span>
                {count !== null ? (
                  <span className="nav__count" aria-label={`${count} open`}>
                    {count}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <button
          type="button"
          className="sidebar__collapse"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
          <span className="nav__text">Collapse</span>
          {collapsed ? <span className="visually-hidden">Expand the sidebar</span> : null}
        </button>
      </aside>

      <div className="frame">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-controls="sidebar"
            aria-expanded={drawerOpen}
          >
            <Icon name="menu" />
          </button>
          <Breadcrumbs pathname={location.pathname} />
          <AccountMenu />
        </header>

        <main className="main" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Where you are: the section, then the record when you are inside one. */
function Breadcrumbs({ pathname }: { pathname: string }) {
  const current = useCurrentCrumb();
  const inEmergency = pathname.startsWith('/emergencies/');
  const section =
    SECTIONS.find((candidate) =>
      candidate.to === '/' ? pathname === '/' || inEmergency : pathname.startsWith(candidate.to),
    ) ?? SECTIONS[0]!;

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {inEmergency ? (
          <>
            <li>
              <Link to={section.to}>{section.label}</Link>
            </li>
            <li aria-current="page">{current ?? 'Emergency'}</li>
          </>
        ) : (
          <li aria-current="page">{section.label}</li>
        )}
      </ol>
    </nav>
  );
}

/**
 * Who is signed in, and signing out, behind one compact control. Sign out sits inside
 * the menu rather than on the bar, so it is never pressed on the way to something else.
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
        <Icon name="expandMore" size={18} />
      </button>
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
      {privacy ? <PrivacyPanel signedIn onClose={() => setPrivacy(false)} /> : null}
    </div>
  );
}
