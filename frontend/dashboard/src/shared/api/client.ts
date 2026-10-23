import type {
  AddressMatch,
  AlertDetail,
  AlertPage,
  AlertSummary,
  DashboardOverview,
  DataPolicy,
  EventState,
  NewUser,
  Session,
  Severity,
  SignInProviders,
  UserPage,
  UserQuery,
  UserRow,
  VolunteerApplication,
  VolunteerStatus,
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
  return (await requestWithHeaders<T>(path, init, retry)).body;
}

/** The same, keeping the response headers, for the one endpoint that puts a count there. */
async function requestWithHeaders<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<{ body: T; headers: Headers }> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (current) headers.set('Authorization', `Bearer ${current.accessToken}`);

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401 && retry && current) {
    const renewed = await refreshSession();
    if (renewed) return requestWithHeaders<T>(path, init, false);
  }

  const body = await parse(response);

  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(body, `Request failed (${response.status})`));
  }

  return { body: body as T, headers: response.headers };
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
  /** Part of the elder's name. */
  q?: string;
  /** Rows to skip, for numbered pages. */
  offset?: number;
}

function toQueryString(query: AlertQuery): string {
  const params = new URLSearchParams();
  if (query.open) params.set('open', 'true');
  if (query.state?.length) params.set('state', query.state.join(','));
  if (query.severity?.length) params.set('severity', query.severity.join(','));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.offset) params.set('offset', String(query.offset));
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

  /** The same sign-in by the email address on the account instead of the phone. */
  async signInWithEmail(email: string, password: string): Promise<Session> {
    const session = await request<Session>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    setSession(session);
    return session;
  },

  /**
   * Hands the ID token from Google's button to the API, which checks it with Google's
   * keys and signs in the administrator whose account has that address.
   */
  async signInWithGoogle(idToken: string): Promise<Session> {
    const session = await request<Session>(
      '/auth/google',
      { method: 'POST', body: JSON.stringify({ idToken }) },
      false,
    );
    setSession(session);
    return session;
  },

  /** Which sign-in methods the server offers beyond a password. */
  providers: (): Promise<SignInProviders> => request<SignInProviders>('/auth/providers', {}, false),

  async signOut(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' }, false);
    } finally {
      setSession(null);
    }
  },

  alerts: (query: AlertQuery = {}): Promise<AlertSummary[]> =>
    request<AlertSummary[]>(`/alerts${toQueryString(query)}`),

  /** A page of the history, with the total the filters match from X-Total-Count. */
  async alertPage(query: AlertQuery = {}): Promise<AlertPage> {
    const { body, headers } = await requestWithHeaders<AlertSummary[]>(
      `/alerts${toQueryString(query)}`,
    );
    const total = Number(headers.get('X-Total-Count'));
    return { items: body, total: Number.isFinite(total) && total > 0 ? total : body.length };
  },

  alert: (id: string): Promise<AlertDetail> => request<AlertDetail>(`/alerts/${id}`),

  users: {
    list: (query: UserQuery = {}): Promise<UserPage> => {
      const params = new URLSearchParams();
      if (query.q?.trim()) params.set('q', query.q.trim());
      if (query.role) params.set('role', query.role);
      if (query.status) params.set('status', query.status);
      if (query.page) params.set('page', String(query.page));
      if (query.pageSize) params.set('pageSize', String(query.pageSize));
      const encoded = params.toString();
      return request<UserPage>(`/admin/users${encoded ? `?${encoded}` : ''}`);
    },
    create: (user: NewUser): Promise<UserRow> =>
      request<UserRow>('/admin/users', { method: 'POST', body: JSON.stringify(user) }),
    update: (
      id: string,
      changes: { name?: string; email?: string | null; coverage?: NewUser['coverage'] },
    ): Promise<UserRow> =>
      request<UserRow>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
    deactivate: (ids: string[]): Promise<{ updated: number }> =>
      request('/admin/users/deactivate', { method: 'POST', body: JSON.stringify({ ids }) }),
    reactivate: (ids: string[]): Promise<{ updated: number }> =>
      request('/admin/users/reactivate', { method: 'POST', body: JSON.stringify({ ids }) }),
  },

  volunteers: {
    list: (status?: VolunteerStatus): Promise<VolunteerApplication[]> =>
      request<VolunteerApplication[]>(`/admin/volunteers${status ? `?status=${status}` : ''}`),
    review: (
      id: string,
      decision: 'approve' | 'reject' | 'suspend',
      note?: string,
    ): Promise<VolunteerApplication> =>
      request<VolunteerApplication>(`/admin/volunteers/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
      }),
  },

  /** Coordinates for an address, through the API's rate-limited geocoder. */
  searchAddress: (q: string): Promise<{ results: AddressMatch[]; attribution: string }> =>
    request(`/elders/address-search?q=${encodeURIComponent(q)}`),

  /** How long records are kept, from the server's own retention settings. */
  policy: (): Promise<DataPolicy> => request<DataPolicy>('/dashboard/policy'),

  overview: (days = 30): Promise<DashboardOverview> =>
    request<DashboardOverview>(`/dashboard/overview?days=${days}`),

  // There is deliberately no acknowledge, resolve or request-responder here. The API
  // refuses all three to an administrator, because taking ownership of an emergency
  // belongs to the people named in that elder's care chain. This console reads the
  // record and reports on it; it cannot alter a live emergency, which is why an
  // administrator account is safe to leave signed in on an operations screen.
};
