# Decisions: The console and running the system

What the administrator console may do, and how the system is configured.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## The administrator console is read-only over emergencies

An administrator is not a participant in any emergency, so the API refuses acknowledge,
resolve and request-responder from that account. The dashboard reflects that rather than
hiding controls the server would reject anyway.

An administrator overseeing a platform has no business taking personal responsibility
for a named person's emergency; that belongs to the people that person named. There is
no operational hole, because the automatic chain already escalates to emergency
responders when nobody in the chain answers. Section 14 of `backend/requests.http`
demonstrates the refusals, which turns it from a claim into something that can be failed
on demand.

Two administrative capabilities are still open and would be the first write this console
has: an editor for escalation rules and severity weights, and care circle management.
Both are configuration rather than intervention, so neither contradicts this decision,
but both need deciding on rather than drifting into.

## Two environment files

`backend/.env` is read by the API and the Prisma CLI. The repository root `.env` is
read by Docker Compose alone and holds only `POSTGRES_PORT` and `REDIS_PORT`.

They were briefly the same file, which is how the published database port and
`DATABASE_URL` came to disagree without anything reporting it. One secret has one home.

## The Postman collection runs from start to finish, as often as you like

On 25 November 2026, run as a whole collection on a setup made by following the first-run
guide, 25 requests failed: answering by text was off, because `.env.example` left its
secret empty; five folders needed a code copied from the terminal; and repeated runs hit
the sign-in and code limits.

**A local secret in `.env.example`.** `SMS_INBOUND_TOKEN` now has a value for this machine,
the one the collection sends, and the API refuses to start in production with it.

**Two endpoints for testing, and only for testing.** `GET /dev/texts` lets an administrator
read the texts the logging provider printed, which is where the collection finds a code;
`POST /dev/clear-limits` clears the rate-limit counters, as `npm run dev:clear-limits`
does. Both answer 404 in production and whenever a real SMS provider is set: with real
texts, reading a code back would let anybody skip proving they hold the phone.

**Checks that wait for the background.** A decline and a text reply are acted on a moment
after the request. The checks that read the result look again for up to five seconds
rather than assuming it is instant.

**New numbers each run.** Signing up uses fresh numbers every time, so a run never meets
the accounts the last one made. Verified with five full runs in a row.
