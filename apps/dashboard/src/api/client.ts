import type {
  AlertDetail,
  AlertSummary,
  DashboardOverview,
  EventState,
  Session,
  Severity,
} from './types';

/**
 * Every route the dashboard uses lives under the API's api/v1 prefix.
 *
 * In development the Vite proxy forwards this path through unchanged, so requests
 * stay same-origin and the browser sends exactly the path the deployed build sends.
 * A base URL is only needed when the two are served from different hosts.
 */
const BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1`;

const STORAGE_KEY = 'mzazicare.session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Where the session lives.
 *
 * sessionStorage rather than localStorage: an operator console left open on a shared
 * machine should not still be signed in after the tab is closed, and the refresh
 * token is the credential that would survive. This is a deliberate trade of
 * convenience for the shorter window, and it is the same reason the API rotates the
 * refresh token on every use.
 */
export const sessionStore = {
  read(): Session | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  write(session: Session | null): void {
    try {
      if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // A browser with storage blocked still works for the length of this tab,
      // because the session is held in React state as well.
    }
  },
};

let current: Session | null = sessionStore.read();
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<(session: Session | null) => void>();

function setSession(session: Session | null): void {
  current = session;
  sessionStore.write(session);
  listeners.forEach((listener) => listener(session));
}

export function onSessionChange(listener: (session: Session | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): Session | null {
  return current;
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');
  }
  return fallback;
}

/**
 * One request, retried once after a token refresh.
 *
 * The retry is attempted at most once and only for a 401, so an endpoint that keeps
 * refusing cannot put the dashboard into a refresh loop against the API. A failed
 * refresh clears the session, which sends the operator back to the sign-in screen
 * rather than leaving a console that silently shows nothing.
 */
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (current) headers.set('Authorization', `Bearer ${current.accessToken}`);

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401 && retry && current) {
    const renewed = await refreshSession();
    if (renewed) return request<T>(path, init, false);
  }

  const body = await parse(response);

  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(body, `Request failed (${response.status})`));
  }

  return body as T;
}

/** Collapses concurrent refreshes, so one expired token cannot rotate twice. */
function refreshSession(): Promise<Session | null> {
  if (refreshing) return refreshing;

  const token = current?.refreshToken;
  if (!token) return Promise.resolve(null);

  refreshing = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  })
    .then(async (response) => {
      if (!response.ok) {
        setSession(null);
        return null;
      }
      const session = (await response.json()) as Session;
      setSession(session);
      return session;
    })
    .catch(() => {
      setSession(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

export interface AlertQuery {
  open?: boolean;
  state?: EventState[];
  severity?: Severity[];
  from?: string;
  to?: string;
  limit?: number;
}

function toQueryString(query: AlertQuery): string {
  const params = new URLSearchParams();
  if (query.open) params.set('open', 'true');
  if (query.state?.length) params.set('state', query.state.join(','));
  if (query.severity?.length) params.set('severity', query.severity.join(','));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.limit) params.set('limit', String(query.limit));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const api = {
  async signIn(phone: string, password: string): Promise<Session> {
    const session = await request<Session>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ phone, password }) },
      false,
    );
    setSession(session);
    return session;
  },

  async signOut(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' }, false);
    } finally {
      setSession(null);
    }
  },

  alerts: (query: AlertQuery = {}): Promise<AlertSummary[]> =>
    request<AlertSummary[]>(`/alerts${toQueryString(query)}`),

  alert: (id: string): Promise<AlertDetail> => request<AlertDetail>(`/alerts/${id}`),

  overview: (days = 30): Promise<DashboardOverview> =>
    request<DashboardOverview>(`/dashboard/overview?days=${days}`),

  // There is deliberately no acknowledge, resolve or request-responder here. The API
  // refuses all three to an administrator, because taking ownership of an emergency
  // belongs to the people named in that elder's care chain. This console reads the
  // record and reports on it; it cannot alter a live emergency, which is why an
  // administrator account is safe to leave signed in on an operations screen.
};
