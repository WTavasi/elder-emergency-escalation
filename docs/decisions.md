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
