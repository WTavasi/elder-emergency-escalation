# Architecture

How the parts that are not obvious actually work. The mechanisms here are the ones
worth being able to explain rather than merely point at.

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
