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
