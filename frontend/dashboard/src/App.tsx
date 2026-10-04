import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { SignIn } from './auth/SignIn';
import { Layout } from './components/Layout';
import { Board } from './screens/Board';
import { EventDetail } from './screens/EventDetail';
import { History } from './screens/History';
import { Reporting } from './screens/Reporting';
import { DataHandling } from './screens/DataHandling';
import { OpenAlertsProvider } from './OpenAlerts';

/**
 * A signed-in account that is not an administrator is turned away here rather than
 * shown an empty console. The API would refuse the reporting endpoint anyway; saying
 * so plainly is better than a screen full of failed requests.
 */
function NotAnAdministrator({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="signin">
      <div className="card signin__card stack">
        <h1>This console is for administrators</h1>
        <p className="muted">
          Your account is signed in, but emergency operations screens are limited to administrator
          accounts. Use the MzaziCare app to see the emergencies you are part of.
        </p>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}

export function App() {
  const { session, signOut } = useAuth();

  if (!session) return <SignIn />;
  if (session.user.role !== 'ADMINISTRATOR') {
    return <NotAnAdministrator onSignOut={() => void signOut()} />;
  }

  return (
    <OpenAlertsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Board />} />
          <Route path="emergencies/:id" element={<EventDetail />} />
          <Route path="history" element={<History />} />
          <Route path="reporting" element={<Reporting />} />
          <Route path="data-handling" element={<DataHandling />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </OpenAlertsProvider>
  );
}
