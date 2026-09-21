# Decisions

Choices that are not obvious from the code, with the reasoning, so they can be defended
or reversed on purpose rather than drifted away from by accident.

## The severity policy is a weighted rule, not machine learning

Six factors with weights held in the database, summing to 100, banded at 35 and 60.

An escalation decision has to be explainable after the fact, to a family member and
potentially to a regulator. A model that scores an emergency at 0.82 cannot answer "why
did it call the ambulance". This can: the factor values and their contributions are
stored on the event, and the dashboard renders them as a table that adds up to the
score. The weights are configuration, so the policy can be tuned without a deployment.

## Escalation timing is event-driven, not polled

An acknowledgement window is a Redis key with a TTL, and expiry drives promotion. A
polling loop would trade accuracy against database load, and the accuracy is the
product.

The cost of that choice is that Redis publishes an expiry once and never again, so a
restart at the wrong moment would lose an escalation forever. That is why every dispatch
also writes a durable `current_tier_deadline_at` and the listener reconciles against it
on boot. See [architecture.md](architecture.md).

## Provider failure has two kinds, and the difference is load-bearing

A permanent failure returns `delivered: false` and the caller moves straight to SMS. A
transient failure throws and the job retries. Getting this backwards either burns three
retries on a dead device token while somebody waits, or gives up on a working one.

## Passwords use scrypt from Node's own crypto module

Not bcrypt or argon2. Both are native modules, and a native dependency is one more thing
that has to compile on every machine and in CI. scrypt is in the standard library, is
memory-hard, and its cost parameters are stored alongside each hash so raising them
invalidates nothing.

## Refresh tokens are stored as a fingerprint, and rotate

The database holds a SHA-256 of the current refresh token, never the token. A stolen
database yields no usable sessions. Presenting a token that verifies but no longer
matches the stored fingerprint means the token was replayed, so every session for that
user is revoked.

## The administrator console is read-only over emergencies

An administrator is not a participant in any emergency, so the API refuses acknowledge,
resolve and request-responder from that account. The dashboard reflects that rather than
hiding controls the server would reject anyway.

An administrator overseeing a platform has no business taking personal responsibility
for a named person's emergency; that belongs to the people that person named. There is
no operational hole, because the automatic chain already escalates to emergency
responders when nobody in the chain answers. Section 14 of `apps/api/requests.http`
demonstrates the refusals, which turns it from a claim into something that can be failed
on demand.

Two administrative capabilities are still open and would be the first write this console
has: an editor for escalation rules and severity weights, and care circle management.
Both are configuration rather than intervention, so neither contradicts this decision,
but both need deciding on rather than drifting into.

## Ownership is claimed by a conditional write

Two responders answering in the same instant could both read `acknowledgedBy` as null
and both be told the emergency was theirs. Ownership is taken by an update whose WHERE
includes `acknowledgedBy: null`, which the database applies atomically with the SET, so
exactly one can match. Zero affected rows means somebody else got there first, which is
a conflict rather than an error.

## Two environment files

`apps/api/.env` is read by the API and the Prisma CLI. The repository root `.env` is
read by Docker Compose alone and holds only `POSTGRES_PORT` and `REDIS_PORT`.

They were briefly the same file, which is how the published database port and
`DATABASE_URL` came to disagree without anything reporting it. One secret has one home.

## Retention is enforced, not just configured

The privacy notice and the console's data handling page both tell people how long their
data is kept. For a while the windows existed as configuration and nothing acted on
them, which made a published promise the system could not keep.

A daily sweep now deletes closed emergencies past their window, which cascades to their
audit logs and notifications, then removes audit entries that outlived their own,
shorter window while their emergency is still retained. An open emergency is never
deleted whatever its age: one nobody ever closed is a failure worth keeping the
evidence of, and the window is measured from when an emergency finished rather than
when it was raised.

It is a plain daily timer rather than a cron library, because it runs once a day and
needs no schedule expression. `npm run retention:sweep -w @mzazicare/api` runs the same
code on demand, so the policy can be demonstrated rather than waited for.

## Waiting on a provider is bounded

Node's `fetch` has no default timeout. A connection that opened and then stalled would
hold a queued notification until its lock expired minutes later, which in an emergency
means nothing is sent and nothing is reported.

Both providers now have a deadline. A timeout throws, which the processor reads as
transient and retries, and that is the right reading: a gateway that did not answer in
time may answer the next attempt. The push timeout bounds the wait rather than
cancelling the request, because Firebase's client offers no way to cancel, so a retry
after a timeout can produce a duplicate. For an emergency alert that is the right
trade: a duplicate is an annoyance, a job blocked on a dead socket is an alert nobody
receives.

## Rate limiting is counted in Redis, and is opt-in per route

An in-memory limiter is only a limit while there is one instance of the API. The moment
the platform runs two, an attacker gets double the attempts and the limit quietly stops
being one. The Redis already running for escalation timers is the natural home.

Applied per route rather than globally, because the panic button is the one endpoint
where refusing a request could cost somebody their emergency. Sign-in is limited where
brute force is the threat; raising an alert is limited far above anything a frightened
person pressing repeatedly would reach, and only to stop a compromised account filling
the database.

If Redis is unreachable the request is allowed. The limit is a mitigation, not the
access control, and refusing every sign-in because Redis is down would turn a degraded
system into an unusable one.

## Colour is defined once

`packages/tokens/tokens.json` is the only place a colour exists. Every consumer reads a
generated file, and the generator recomputes 26 declared WCAG pairs and exits non-zero
if one regresses, so an inaccessible palette fails CI rather than shipping.

A hard-coded hex anywhere in an app is the one value that gate cannot check, which is
why there are none.

## The socket carries changes, not truth

Every screen loads over HTTP first and treats a socket message as a reason to update
what it already has. A dropped connection therefore degrades the dashboard to a
slightly stale one rather than an empty one, and the connection state is shown, because
an operator has to be able to tell "nothing is happening" apart from "I am no longer
being told what is happening".

Publishing is fire and forget. An escalation that failed because a socket was
unavailable would be a real emergency lost to a cosmetic feature.
