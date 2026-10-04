import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useOpenAlerts } from '../OpenAlerts';
import { humanise } from '../format';

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
        <div>
          <div className="sidebar__brand">MzaziCare</div>
          <div className="sidebar__role">
            {session ? `${session.user.name}, ${humanise(session.user.role)}` : ''}
          </div>
        </div>

        <nav className="nav" aria-label="Sections">
          <NavLink to="/" end>
            <span>Open emergencies</span>
            {openCount === null ? null : <span className="nav__count">{openCount}</span>}
          </NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/reporting">Reporting</NavLink>
          <NavLink to="/data-handling">Data handling</NavLink>
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>
    </div>
  );
}
