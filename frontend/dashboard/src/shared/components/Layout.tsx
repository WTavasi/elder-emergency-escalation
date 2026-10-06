import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useOpenAlerts } from '../state/OpenAlerts';
import { humanise } from '../utils/format';
import { Icon, type IconName } from './Icon';

const SECTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Open emergencies', icon: 'emergency' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/reporting', label: 'Reporting', icon: 'reporting' },
  { to: '/data-handling', label: 'Data handling', icon: 'privacy' },
];

/** Up to two initials, for the account mark. Never a photo: the console stores none. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0)?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';
  return (first + last || '?').toUpperCase();
}

export function Layout() {
  const { session, signOut } = useAuth();
  const { alerts } = useOpenAlerts();
  const openCount = alerts?.length ?? null;

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="sidebar">
        <div className="sidebar__brand">MzaziCare</div>

        {/*
          An icon beside each section name, never instead of it. The four sections are
          visited many times a shift, and a shape is found faster than a word once it
          has been learned; the word stays for everyone who has not learned it yet.
        */}
        <nav className="nav" aria-label="Sections">
          {SECTIONS.map((section) => (
            <NavLink key={section.to} to={section.to} end={section.to === '/'}>
              <span className="nav__label">
                <Icon name={section.icon} />
                {section.label}
              </span>
              {section.to === '/' && openCount !== null ? (
                <span className="nav__count">{openCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        {/*
          The account, and sign out as an icon button, the same control the mobile app
          uses so it is one thing to learn across both. It is the one icon-only control
          the design language allows, and it carries its name for screen readers and as
          a tooltip.
        */}
        <div className="account">
          {session ? (
            <>
              <span className="account__mark" aria-hidden="true">
                {initials(session.user.name)}
              </span>
              <span className="account__who">
                <span className="account__name">{session.user.name}</span>
                <span className="account__role">{humanise(session.user.role)}</span>
              </span>
            </>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>
    </div>
  );
}
