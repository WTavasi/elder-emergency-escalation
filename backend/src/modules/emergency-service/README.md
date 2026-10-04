# emergency-service

Raising an emergency, scoring it, the escalation ladder, and everything a person can do
about it once it is raised. The core of the project.

**Mounted at:** `/api/v1/alerts`

## Scope

**Owns:** raising, withdrawing and reopening an alert; the severity policy; dispatching
each tier and escalating when a window runs out; acknowledging, declining, closing and
calling in a responder.

**Does not own:** delivering a message (`notification-service`), live updates to the
console (`realtime-service`), or the elder's own record (`elder-service`).

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/` | elder | Raise an emergency. Empty body; the server decides where it is |
| POST | `/:id/cancel` | elder | Withdraw inside the grace window |
| POST | `/:id/reopen` | care chain | Restart a withdrawn alert nobody could confirm |
| GET | `/` | signed in | The emergencies the caller is part of |
| GET | `/:id` | participants | One emergency, with its chain and what has happened |
| POST | `/:id/acknowledge` | participants | Take it on, which stops the chain |
| POST | `/:id/decline` | asked at this tier | Cannot come; moves on at once if nobody else at the tier is left |
| POST | `/:id/resolve` | participants | Close it with an outcome |
| POST | `/:id/request-responder` | participants | Call in an emergency responder now |

## How escalation works

An acknowledgement window is a Redis key with a time to live. When it expires, Redis
announces it and `consumers/escalation.listener.ts` promotes the emergency. Every
dispatch also records a deadline in the database, so a restart cannot lose one, and
`workers/escalation-sweep.service.ts` reconciles those deadlines on an interval in case
expiry events never arrive. The full account is in
[`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

## Data it writes

`emergency_events`, `audit_logs`, and the `declined_at` mark on `notifications`. Reads the
escalation rules and severity weights fresh on every use, so changing them in the database
takes effect on the next alert with no restart.

## Files

| Path | What it is |
| --- | --- |
| `alerts.module.ts`, `escalation.module.ts`, `severity.module.ts` | NestJS wiring, one per part |
| `controllers/alerts.controller.ts` | Raise, withdraw, reopen, list, detail |
| `controllers/escalation.controller.ts` | Acknowledge, decline, resolve, request a responder |
| `services/alerts.service.ts` | Raising, the grace window, reopening, the list and detail |
| `services/escalation.service.ts` | Dispatch, acknowledge, decline, resolve, escalate |
| `services/escalation-timer.service.ts` | Sets and clears the Redis window keys |
| `services/escalation.keys.ts` | The key format, in one place |
| `services/severity.service.ts` | The weighted severity policy |
| `consumers/escalation.listener.ts` | Window expiry becomes promotion; recovery on boot |
| `workers/escalation-sweep.service.ts` | Reconciles recorded deadlines on an interval |
| `validation/` | The request shapes for each endpoint |
| `views/alert-views.ts` | What the app and the console are allowed to see |
| `models/severity.types.ts` | The inputs and outputs of the severity policy |

## Depends on

`notification-service` to send messages, `realtime-service` to publish updates.
