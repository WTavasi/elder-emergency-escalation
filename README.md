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

Elders are registered by a caregiver rather than themselves, because the consent record
has to name who consented on whose behalf. Emergency responders and administrators are
created by an administrator. Those endpoints arrive with the users module.

Every route is authenticated unless it declares `@Public()`, so a new endpoint is
protected by default rather than by remembering to protect it.

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
