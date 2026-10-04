import { useState } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * Sign-in for the operations console.
 *
 * The API answers a wrong password and an unknown phone number identically, and this
 * screen shows whatever it says rather than trying to be more helpful, because a more
 * specific message here would undo that property in the interface.
 */
export function SignIn() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(phone, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not reach the server. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <form className="card signin__card" onSubmit={submit} noValidate>
        <h1>MzaziCare Operations</h1>
        <p className="muted" style={{ marginTop: 'var(--space-8)' }}>
          Administrator access to emergency records and reporting.
        </p>

        {error ? (
          <p className="notice notice--error" role="alert" style={{ marginTop: 'var(--space-16)' }}>
            {error}
          </p>
        ) : null}

        <div className="field" style={{ marginTop: 'var(--space-24)' }}>
          <label htmlFor="phone">Phone number</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="username"
            required
            value={phone}
            onChange={(changeEvent) => setPhone(changeEvent.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
          />
        </div>

        <button type="submit" className="button--emergency" disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>

        <p className="micro" style={{ marginTop: 'var(--space-16)' }}>
          An administrator account can see every elder&apos;s emergency record. Sign out when you
          leave this machine.
        </p>
      </form>
    </main>
  );
}
