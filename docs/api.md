# API reference

Base path `/api/v1`. Health sits outside it, so a platform check has a stable address
that does not move when the version does.

Every route is authenticated unless it declares `@Public()`, so a new endpoint is
protected by default rather than by remembering to protect it.

`apps/api/requests.http` holds all of these as runnable blocks. Open it in VS Code with
the REST Client extension and a **Send Request** link appears above each one.

## Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Postgres and Redis checked separately; 503 if either is down |
| POST | `/api/v1/auth/register` | none | Self-registration, caregivers and family members only |
| POST | `/api/v1/auth/login` | none | Phone and password, returns both tokens |
| POST | `/api/v1/auth/refresh` | none | Rotates the refresh token; a replay revokes every session |
| POST | `/api/v1/auth/logout` | bearer | Ends every session for that user |
| GET | `/api/v1/auth/me` | bearer | The signed-in user |

Elders are registered by a caregiver rather than themselves, because the consent record
has to name who consented on whose behalf. Emergency responders and administrators are
created by an administrator. Those endpoints arrive with the users module.

A wrong password and an unknown phone number produce the same message through the same
code path, so the API cannot be used to discover who is registered.

## Emergencies

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/alerts` | elder | Raise an emergency. Scores severity and writes the audit trail |
| POST | `/api/v1/alerts/:id/cancel` | elder | Withdraw inside the grace window |
| POST | `/api/v1/alerts/:id/reopen` | care chain | Restart a cancelled alert nobody could confirm |
| GET | `/api/v1/alerts` | bearer | Emergencies the caller is part of |
| GET | `/api/v1/alerts/:id` | participants | One emergency, with its chain, audit trail and deliveries |
| POST | `/api/v1/alerts/:id/acknowledge` | participants | Take ownership, stopping the chain |
| POST | `/api/v1/alerts/:id/resolve` | participants | Close with a recorded outcome |
| POST | `/api/v1/alerts/:id/request-responder` | participants | Call in the responder now, superseding the chain |

Every query is scoped to the caller's own care relationships. An emergency the caller is
not part of returns 404 rather than 403, so the API does not confirm that an id exists.

"Participants" means the elder, anybody in that elder's care chain, or anybody who was
actually notified. An administrator is **not** a participant, so the three action
endpoints refuse an administrator account. That is deliberate and is covered in
[decisions.md](decisions.md).

### Listing filters

`GET /api/v1/alerts` accepts:

| Parameter | Example | Meaning |
| --- | --- | --- |
| `open` | `?open=true` | only emergencies that are still live |
| `state` | `?state=ESCALATED,NOTIFIED` | one or more states, comma separated |
| `severity` | `?severity=CRITICAL` | one or more severity bands |
| `elderId` | `?elderId=<uuid>` | one elder |
| `from`, `to` | `?from=2026-09-01T00:00:00Z` | raised within a window |
| `limit` | `?limit=100` | page size, capped at 200, default 50 |
| `cursor` | `?cursor=<uuid>` | id of the last row of the previous page |

An unrecognised value is rejected with a 400 naming the field, rather than reaching the
database and surfacing as a 500 that discloses something about the schema.

## Reporting

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard/overview` | administrator | Aggregate figures across every elder |

`?days=30` sets the window, from 1 to 365. Returns live counts, response times as a
median as well as a mean with the sample size, how far emergencies travelled down the
chain, and per-channel delivery reliability.

This one is restricted by role rather than by care relationship, because it has no
scope of its own: it reports across everybody. A caregiver is refused.

## Live updates

Socket.IO namespace `/realtime`, message `emergency.updated`. See
[architecture.md](architecture.md).
