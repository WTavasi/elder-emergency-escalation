import { useEffect, useState } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type { SignInProviders } from '../../shared/api/types';
import { useAuth } from '../../shared/state/AuthContext';
import { PhoneInput } from '../../shared/phone/PhoneInput';
import { DEFAULT_COUNTRY, readPhone } from '../../shared/phone/read-phone';
import { PrivacyPanel } from '../privacy/PrivacyPanel';
import { GoogleButton, googleScriptLoaded } from './GoogleButton';

type Handle = 'phone' | 'email';

const UNREACHABLE = 'Could not reach the server. Try again.';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Sign-in for the operations console.
 *
 * By phone number, as everywhere else, or by the email address on the account, which
 * suits somebody at a desk; and with Google when the server has a client ID, for an
 * administrator whose account has that Google address. Google never creates an account.
 *
 * The API answers a wrong password and an unknown account identically, and this screen
 * shows whatever it says rather than trying to be more helpful, because a more specific
 * message here would undo that property in the interface.
 */
export function SignIn() {
  const { signIn, signInWithEmail, signInWithGoogle } = useAuth();
  const [handle, setHandle] = useState<Handle>('phone');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<SignInProviders | null>(null);
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A server that cannot say is a server without Google: the password still works.
    api
      .providers()
      .then((found) => {
        if (!cancelled) setProviders(found);
      })
      .catch(() => {
        if (!cancelled) setProviders({ google: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function attempt(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      // Signed in. If Google's script is in this page, start a clean one: see
      // googleScriptLoaded. The session is in sessionStorage, so it survives the reload.
      if (googleScriptLoaded()) window.location.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  async function submit(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    if (handle === 'phone') {
      const reading = readPhone(country, phone);
      if (reading.problem !== null) {
        setError(reading.problem);
        return;
      }
      await attempt(() => signIn(reading.e164, password));
      return;
    }

    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError('That does not look like an email address.');
      return;
    }
    await attempt(() => signInWithEmail(address, password));
  }

  // Not memoised: the button keeps the latest one in a ref, so a new function each
  // render costs nothing and never re-draws Google's button.
  function onGoogle(idToken: string) {
    void attempt(() => signInWithGoogle(idToken));
  }

  function choose(next: Handle) {
    setHandle(next);
    setError(null);
  }

  return (
    <main className="signin">
      <SignInBrand />
      <div className="signin__side">
        <form className="signin__form" onSubmit={submit} noValidate>
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 'var(--space-8)' }}>
            Administrator access to emergency records and reporting.
          </p>

          {error ? (
            <p
              className="notice notice--error"
              role="alert"
              style={{ marginTop: 'var(--space-16)' }}
            >
              {error}
            </p>
          ) : null}

          <div
            className="segmented signin__handle"
            role="group"
            aria-label="Sign in with"
            style={{ marginTop: 'var(--space-24)' }}
          >
            <button type="button" aria-pressed={handle === 'phone'} onClick={() => choose('phone')}>
              Phone number
            </button>
            <button type="button" aria-pressed={handle === 'email'} onClick={() => choose('email')}>
              Email
            </button>
          </div>

          <div className="field" style={{ marginTop: 'var(--space-16)' }}>
            {handle === 'phone' ? (
              <PhoneInput
                id="phone"
                label="Phone number"
                country={country}
                value={phone}
                onCountryChange={setCountry}
                onChange={setPhone}
              />
            ) : (
              <>
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(changeEvent) => setEmail(changeEvent.target.value)}
                />
              </>
            )}
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

          <button type="submit" className="button--primary signin__submit" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </button>

          {providers?.google ? (
            <>
              <p className="signin__or" aria-hidden="true">
                <span>or</span>
              </p>
              <GoogleButton clientId={providers.google.clientId} onCredential={onGoogle} />
            </>
          ) : null}

          <p className="micro" style={{ marginTop: 'var(--space-16)' }}>
            An administrator account can see every elder&apos;s emergency record. Sign out when you
            leave this machine.
          </p>
          <button
            type="button"
            className="link-button micro"
            onClick={() => setPrivacy(true)}
            style={{ marginTop: 'var(--space-8)' }}
          >
            Privacy and data
          </button>
          {privacy ? <PrivacyPanel signedIn={false} onClose={() => setPrivacy(false)} /> : null}
        </form>
      </div>
    </main>
  );
}

/**
 * MzaziCare's red with the care rings in faint white and the name, as the app's sign-in
 * carries them, so the first screen anybody sees on either looks like the same product.
 * Down the left of a wide window and across the top of a narrow one, with a curved edge
 * where it meets the form. Type only: there is no logo, and inventing one is not this
 * project's job. The red is the same in light and dark: it is the product's mark here,
 * and no emergency can be on screen before sign-in.
 */
export function SignInBrand() {
  return (
    <section className="signin__brand" aria-label="MzaziCare">
      <p className="signin__name">MzaziCare</p>
      <p className="signin__tagline">Emergency help for elders at home</p>
      <p className="signin__console">Operations console</p>
    </section>
  );
}
