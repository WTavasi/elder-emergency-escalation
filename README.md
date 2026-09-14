# MzaziCare Escalation

A real-time emergency response coordination and escalation framework for home-based
elderly care, built as the MzaziCare platform's alerting subsystem.

One panic button raises an alert. The system then works down a ranked chain of
responders, caregiver to family member to emergency responder, promoting the alert
automatically when a tier fails to acknowledge inside its timeout, with an SMS
fallback where push cannot be delivered. Every state change is written to an audit log.

## Repository layout

```
apps/
  api/                 NestJS modular monolith (REST plus Socket.IO)
  mobile/              Flutter app, role-based screens for all five roles
  admin/               React and TypeScript administrator dashboard
packages/
  tokens/              design tokens, the single source of truth for colour and type
docs/
  design-language.md   enforceable design constraints
.github/workflows/     CI
```

## Prerequisites

- Node 22 (`nvm use` reads `.nvmrc`)
- Docker Desktop, for Postgres 16 and Redis 7
- Flutter SDK, for `apps/mobile`

## Quick start

```bash
npm install                       # also generates the token outputs via postinstall
cp .env.example apps/api/.env     # then fill in the secrets
docker compose up -d              # Postgres and Redis
npm run db:migrate -w @mzazicare/api   # create the schema
npm run db:seed -w @mzazicare/api      # synthetic development data
npm run test:integration -w @mzazicare/api  # escalation end to end, needs the services up
```

The environment file lives at `apps/api/.env`, not the repository root, because the
Prisma CLI resolves it relative to the workspace it runs in. `.env` is gitignored at
every level.

### Two environment files, on purpose

| File | Read by | Holds |
| --- | --- | --- |
| `apps/api/.env` | the API and the Prisma CLI | database URL, Redis URL, JWT secrets, provider keys |
| `.env` at the repository root | Docker Compose only | `POSTGRES_PORT` and `REDIS_PORT` host port overrides |

The root file is optional. Create it only if port 5432 or 6379 is already taken on
your machine, for example by a Homebrew Postgres:

```bash
printf 'POSTGRES_PORT=5433\nREDIS_PORT=6379\n' > .env
docker compose up -d
```

Then change the port in `apps/api/.env` to match:
`DATABASE_URL=postgresql://mzazicare:mzazicare@localhost:5433/mzazicare`

## Design tokens

`packages/tokens/tokens.json` is the only place a colour is defined. `npm run tokens:build`
generates:

| Output | Consumer |
| --- | --- |
| `dist/tokens.dart` | Flutter app |
| `dist/tokens.css` | admin dashboard |
| `dist/tokens.ts` | admin dashboard, typed access |
| `dist/contrast-report.json` | evidence for the report |

The build recomputes every declared contrast pair to WCAG 2.1 and exits non-zero if one
falls below its documented minimum, so an inaccessible palette fails CI rather than
shipping. Never hard-code a hex value in an app.

## API

Base path `/api/v1`. Health sits outside it so a platform check has a stable address.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Postgres and Redis checked separately; 503 if either is down |
| POST | `/api/v1/auth/register` | none | Self-registration, caregivers and family members only |
| POST | `/api/v1/auth/login` | none | Phone and password, returns both tokens |
| POST | `/api/v1/auth/refresh` | none | Rotates the refresh token |
| POST | `/api/v1/auth/logout` | bearer | Ends every session for that user |
| GET | `/api/v1/auth/me` | bearer | The signed-in user |
| POST | `/api/v1/alerts` | elder | Raise an emergency. Scores severity and writes the audit trail |
| POST | `/api/v1/alerts/:id/cancel` | elder | Withdraw inside the grace window |
| POST | `/api/v1/alerts/:id/reopen` | care chain | Restart a cancelled alert nobody could confirm |
| GET | `/api/v1/alerts` | bearer | Emergencies the caller is part of. `?open=true` for live ones |
| GET | `/api/v1/alerts/:id` | participants | One emergency |
| POST | `/api/v1/alerts/:id/acknowledge` | participants | Take ownership, stopping the chain |
| POST | `/api/v1/alerts/:id/resolve` | participants | Close with a recorded outcome |
| POST | `/api/v1/alerts/:id/request-responder` | participants | Call in the responder now, superseding the chain |

Elders are registered by a caregiver rather than themselves, because the consent record
has to name who consented on whose behalf. Emergency responders and administrators are
created by an administrator. Those endpoints arrive with the users module.

Every route is authenticated unless it declares `@Public()`, so a new endpoint is
protected by default rather than by remembering to protect it.

## How escalation actually works

An acknowledgement window is a Redis key with a time to live. Nothing polls and nothing
waits: when the key expires, Redis publishes an expiry event, the listener catches it and
promotes the emergency to the next tier.

Redis expiry notifications are delivered once, to whoever is listening at that moment,
and never again. If the API is restarting when a key expires, that escalation would be
lost forever. So every dispatch also writes `current_tier_deadline_at` to the database,
and on boot the listener compares every open event against it: overdue events escalate
immediately, and events still inside their window have their Redis key restored with the
time that remains. A deployment cannot swallow an escalation.

Key expiry events are off in a default Redis, and a Redis without them accepts every
timer and silently never mentions them again. The API checks on boot and, if the flags
are missing, sets them at runtime while preserving any that are already there. If the
server refuses CONFIG SET, which a managed Redis may, it logs the exact setting to
change rather than starting up quietly broken.

Acknowledging, resolving, cancelling and requesting a responder all clear the pending
timers first, so a stale expiry cannot promote an emergency somebody is already handling.
Expiries that arrive late are ignored rather than treated as errors, because a timer
firing just after an acknowledgement is normal.

## How notifications are delivered

Dispatching records who should be told, inside the same transaction that moves the
emergency, so a committed dispatch always appears in the audit trail even if the queue
is unreachable. The sending itself is a queued job with three attempts and exponential
backoff, because it is the one part of the system that talks to somebody else's network.

Providers report failure in two different ways, and the difference matters. A permanent
failure, such as a device that is no longer registered, returns `delivered: false` and
the caller moves straight to SMS. A transient failure, such as a timeout, throws and the
job retries. Getting that backwards either burns retries on a dead token or gives up on
a working one.

The SMS fallback fires at most once per recipient per tier, so a push failing twice does
not put two texts on somebody's phone. The critical severity band sends SMS alongside
push from the start rather than waiting for push to fail.

Two real adapters are wired behind those interfaces. Firebase Cloud Messaging sends at
high priority, which is what wakes a device out of doze, and treats an unregistered
token as permanent so the SMS fallback runs immediately rather than after three
retries. Africa's Talking is called over its HTTP API directly: their status codes 100
to 102 mean accepted, 500 and above mean their gateway is unwell and the job should
retry, and everything else, such as an invalid number or an empty balance, will fail
identically next time and so becomes a permanent failure.

To check the SMS credentials on their own, without going through the API:

```bash
npm run check:sms -w @mzazicare/api -- +254712345678
```

It reports the username, the key's length and first and last characters, which endpoint
it chose and what came back, without ever printing the key.

Switch either on in `apps/api/.env` with `PUSH_PROVIDER=fcm` and
`SMS_PROVIDER=africastalking`. In the Africa's Talking sandbox the username is always
the literal string `sandbox` and messages arrive in their web simulator rather than on
a handset, which needs no registered number.

In development both providers default to the logging ones: they write what would have been sent
and report success, so the whole chain including the fallback can be exercised without
credentials. The API refuses to start in production while either is still set to logging.

## Live updates

Responder screens and the dashboard connect to a Socket.IO namespace at `/realtime`
and receive an `emergency.updated` message whenever an emergency changes: raised,
dispatched, escalated, acknowledged, resolved, cancelled or reopened.

The handshake carries an access token, the same one used for HTTP:

```js
io('http://localhost:3000/realtime', { auth: { token: accessToken } });
```

A socket with no token, or a bad one, is disconnected rather than left attached. Rooms
are worked out once at connection time from the same care assignments that decide who
gets notified, so a publish is one emit to one room rather than a query per change, and
a caregiver cannot subscribe to an elder they have no relationship with because they
were never put in that room. Administrators join a room that receives everything.

The message is a compact snapshot rather than the database row. The audit trail and the
severity breakdown are fetched over HTTP when someone opens an event.

Publishing is fire and forget. A screen that misses a message refreshes over HTTP,
whereas an escalation that failed because a socket was unavailable would be a real
emergency lost to a cosmetic feature.

## Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- Short-lived feature branches off `main`
- Generated files are not edited by hand and are listed in `.gitignore`
- Secrets live in `.env` and `credentials/`, both gitignored

## Data protection

The system processes location and contact data about people who are frequently not the
ones operating the app. It is governed by the Kenya Data Protection Act 2019 and the
Data Protection (General) Regulations 2021. Consent is recorded as data, retention
windows are configuration enforced by a scheduled job, and no third-party analytics or
tracking is present in either surface. See `docs/design-language.md`.

The system is not a medical device, detects nothing on its own, and is not a substitute
for emergency services.

## Planned

- API workspace with the escalation engine and Redis-driven timers
- Flutter and dashboard workspaces
- Coverage reporting in CI, and a deployment pipeline to Render
