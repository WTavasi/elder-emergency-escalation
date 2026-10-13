import { useEffect, useRef, useState } from 'react';

/** The parts of Google Identity Services this console uses. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: 'popup';
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: {
          type?: 'standard';
          theme?: 'outline' | 'filled_black';
          size?: 'large';
          text?: 'signin_with';
          shape?: 'rectangular';
          width?: number;
          logo_alignment?: 'left' | 'center';
        },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleIdentity> | null = null;

/**
 * Whether Google's script has been put into this page.
 *
 * Once it has, it stays for as long as the page does, with the same access to the page
 * as the console's own code, and the screens after sign-in show elders' names and
 * addresses. So a signed-in console must never be the page that loaded it: after any
 * sign-in on a page where it was loaded, the page is reloaded, and the fresh page, which
 * goes straight to the signed-in screens, never fetches it.
 */
export function googleScriptLoaded(): boolean {
  return loading !== null || window.google !== undefined;
}

/** Loads Google's script once, however many times the sign-in screen is shown. */
function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google) return Promise.resolve(window.google);
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.google ? resolve(window.google) : reject(new Error('Google did not load'));
    script.onerror = () => {
      loading = null;
      reject(new Error('Google did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Google's own sign-in button, drawn by Google's script, as its branding rules require.
 *
 * The button hands back an ID token, which goes to the API unread: the API checks it
 * against Google's keys and decides whether it belongs to an administrator. Google's
 * script is only fetched when the server has a client ID, so a deployment without one
 * makes no request to Google at all.
 */
export function GoogleButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (idToken: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callback.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadGoogle()
      .then((google) => {
        if (cancelled || !slot.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) callback.current(response.credential);
          },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
        google.accounts.id.renderButton(slot.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: slot.current.clientWidth || 352,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (failed) {
    return (
      <p className="micro" role="status">
        Google sign-in could not load. Use your phone number or email instead.
      </p>
    );
  }
  return <div ref={slot} className="signin__google" />;
}
