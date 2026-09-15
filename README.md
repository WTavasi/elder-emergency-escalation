# MzaziCare Escalation

A real-time emergency response coordination and escalation framework for home-based
elderly care, built as the MzaziCare platform's alerting subsystem.

One panic button raises an alert. The system scores its severity from six weighted
factors, then works down a ranked chain of responders, caregiver to family member to
emergency responder, promoting the alert automatically when a tier fails to acknowledge
inside its timeout, with an SMS fallback where push cannot be delivered. Every state
change is written to an audit log, and every escalation decision can be explained after
the fact from the factor values stored alongside it.

Final year project, Strathmore University. Not a medical device. It detects nothing on
its own and is not a substitute for emergency services.

## Getting started

New to the project, or starting the laptop from cold? Read
**[docs/running.md](docs/running.md)**, which walks through it step by step for both a
plain terminal and VS Code.

The short version, once the project is already set up:

```bash
docker compose up -d      # Postgres and Redis
npm run dev               # the API, on port 3000
npm run dev:dashboard     # the dashboard, on port 5173
```

Sign in at http://localhost:5173 with `+254700000001` and `Dev!2026`.

## Documentation

Everything lives in [docs/](docs/README.md):

| Document | What it covers |
| --- | --- |
| [running.md](docs/running.md) | Starting the system from cold, and troubleshooting |
| [testing.md](docs/testing.md) | The four testing layers, and how to demonstrate the system |
| [api.md](docs/api.md) | Every endpoint, its authorisation and its filters |
| [architecture.md](docs/architecture.md) | Escalation, notifications, live updates, design tokens |
| [decisions.md](docs/decisions.md) | Choices that are not obvious from the code, and why |
| [design-language.md](docs/design-language.md) | The enforceable design constraints |
| [schema-extensions.md](docs/schema-extensions.md) | Differences between the database and the Chapter 4 ERD |

## Repository layout

```
apps/
  api/                   NestJS modular monolith: REST, Socket.IO, escalation engine
    prisma/              schema, migrations, synthetic seed
    scripts/             operator tools: the demonstration, the SMS credentials check
    test/                integration tests, against real services
    requests.http        every endpoint as a runnable request
  dashboard/             React administrator console, read-only over emergencies
packages/
  tokens/                design tokens, the single source of truth for colour and type
docs/                    everything in the table above
.vscode/                 shared workspace: extensions, tasks, debug configurations
.github/workflows/       CI
docker-compose.yml       Postgres 16 and Redis 7 with keyspace expiry
```

The Flutter app will arrive as `apps/mobile`.

## Prerequisites

- **Node 22.** `nvm use` reads `.nvmrc`. The `engines` field declares `>=22 <23` and CI
  builds on 22, so a different major on a developer machine means the build being
  graded and the build being run are not the same one.
- **Docker Desktop**, for Postgres 16 and Redis 7.
- **VS Code** is recommended but not required. `.vscode/` is committed, so the
  extensions, tasks and debug configurations come with the repository.

## Environment

Two files, deliberately separate. One secret has one home.

| File | Read by | Holds |
| --- | --- | --- |
| `apps/api/.env` | the API and the Prisma CLI | database URL, Redis URL, JWT secrets, provider keys |
| `.env` at the repository root | Docker Compose only | `POSTGRES_PORT` and `REDIS_PORT` |

`.env` is gitignored at every level, as is `credentials/`. The API validates every
variable at startup and refuses to run on an incomplete configuration rather than
failing later with something unrelated.

The root file is needed only when 5432 or 6379 is already taken, for example by a
Homebrew Postgres. On the development machine it is:

```bash
printf 'POSTGRES_PORT=5433\nREDIS_PORT=6379\n' > .env
```

with `DATABASE_URL` in `apps/api/.env` pointing at the same port. Do not copy
`.env.example` to the repository root; it is the template for the API's file.

## Notification providers

Both default to logging adapters in development, which write what would have been sent
and report success, so the whole chain including the SMS fallback can be exercised
without credentials. The API refuses to start in production while either is still set
to logging.

Switch the real ones on per run rather than writing them into `.env`, so the test
suites stay deterministic:

```bash
PUSH_PROVIDER=fcm SMS_PROVIDER=africastalking npm run dev
```

To check the SMS credentials on their own, without going through the API:

```bash
npm run check:sms -w @mzazicare/api -- +254712345678
```

It reports the username, the key's length and first and last characters, which endpoint
it chose and what came back, without ever printing the key.

## Commands

```bash
npm run dev                                   # API on 3000
npm run dev:dashboard                         # dashboard on 5173
npm test                                      # every unit test, both workspaces
npm run test:integration -w @mzazicare/api    # against real Postgres and Redis
npm run demo -w @mzazicare/api                # narrated end-to-end run
npm run lint                                  # everything
npm run format:check                          # everything
npm run typecheck                             # every workspace
npm run tokens:check                          # the contrast gate
npm run db:migrate -w @mzazicare/api          # create or update the schema
npm run db:seed -w @mzazicare/api             # synthetic development data
npm run db:studio -w @mzazicare/api           # browse the database
```

## Data protection

The system processes location and contact data about people who are frequently not the
ones operating the app. It is governed by the Kenya Data Protection Act 2019 and the
Data Protection (General) Regulations 2021.

Consent is recorded as data. Retention windows are configuration, enforced by a
scheduled job. A responder's location is captured once, at the moment they take
responsibility, with no background or proximity tracking. Neither surface contains
analytics, tracking or any third-party embed, and the dashboard sets no cookies, which
is why it asks for no cookie consent. The console states all of this on its own data
handling page.

## Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`
- Short-lived feature branches off `main`
- Generated files are never edited by hand and are listed in `.gitignore`
- No colour is written as a literal anywhere; it comes from `packages/tokens`
- Secrets live in `.env` and `credentials/`, both gitignored
