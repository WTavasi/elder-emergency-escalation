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
| POST | `/:id/cancel` | elder | Withdraw inside the grace window, while nobody has taken it on |
| POST | `/:id/reopen` | care chain | Restart a withdrawn alert nobody could confirm |
| GET | `/` | signed in | The emergencies the caller is part of |
| GET | `/:id` | participants | One emergency, with its chain and what has happened |
| POST | `/:id/acknowledge` | participants | Take it on, which stops the chain |
| POST | `/:id/decline` | asked at this tier | Cannot come; moves on at once if nobody else at the tier is left |
| POST | `/:id/resolve` | participants | Close it with an outcome |
| POST | `/:id/request-responder` | participants | Call in an emergency responder now |
| POST | `/:id/voice` | participants, not an administrator | A token to join the emergency's voice room (`VoiceService`); the first responder to join is who the elder's screen names |
| POST | `/sms/inbound?token=` | the SMS gateway | A reply of 1 or 2 to an alert text, handled as an acknowledgement or a decline (`SmsRepliesService`) |

## How escalation works

An acknowledgement window is a Redis key with a time to live. When it expires, Redis
announces it and `consumers/escalation.listener.ts` promotes the emergency. Every
dispatch also records a deadline in the database, so a restart cannot lose one, and
`workers/escalation-sweep.service.ts` reconciles those deadlines on an interval in case
expiry events never arrive. The full account is in
[`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

Severity is scored at the press and again, once, when the cancel window closes and
"did not cancel" can count (`EscalationService.reviewSeverity`, driven by a review key
like the tier timers, with the sweep as its safety net). A higher band applies to the
rest of the chain at once.

Every state change goes through `shared/utils/event-lifecycle.ts`, the one table of
which state may become which. Its writes are conditional on the row still being in a
state the move can come from, so a timer that fires as somebody acknowledges, or two
people reopening at once, cannot overwrite each other.

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
| `models/severity-context.ts` | Builds what the policy reads, the same way at the press, the review and a reopen |
| `consumers/escalation.listener.ts` | Window expiry becomes promotion; recovery on boot |
| `workers/escalation-sweep.service.ts` | Reconciles recorded deadlines on an interval |
| `validation/` | The request shapes for each endpoint |
| `views/alert-views.ts` | What the app and the console are allowed to see |
| `models/severity.types.ts` | The inputs and outputs of the severity policy |

## Depends on

`notification-service` to send messages, `realtime-service` to publish updates.
