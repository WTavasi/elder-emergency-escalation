# Testing the system

Four layers, weakest to strongest. Run them in this order, because each one assumes
the one before it passed.

| Layer | Command | Needs | Proves |
| --- | --- | --- | --- |
| 1 | `npm test` | nothing | the logic is correct in isolation |
| 2 | `npm run test:integration -w @mzazicare/api` | Docker | the escalation is genuinely event-driven |
| 3 | `npm run demo -w @mzazicare/api` | Docker, API | the whole lifecycle works end to end |
| 4 | the dashboard, by hand | all three above | an operator can see it happening |

---

## Layer 1: the unit suites

```bash
cd ~/Desktop/Mzazicare
npm test
```

This runs both workspaces. Expect:

```
Test Suites: 27 passed, 27 total          <- the API
Tests:       223 passed, 223 total

Test Files  3 passed (3)                  <- the dashboard
     Tests  16 passed (16)
```

No database and no network. It covers the severity policy, the escalation decisions,
the notification copy rules, the provider failure taxonomy, the auth primitives, the
board ordering rule and the token refresh path.

This is the fastest thing to run and the first thing to show if anyone asks how you
know the system works.

To run only one workspace:

```bash
npm test -w @mzazicare/api
npm test -w @mzazicare/dashboard
```

## Layer 2: the integration suite

```bash
docker compose up -d
npm run test:integration -w @mzazicare/api
```

Six tests against the real Postgres and the real Redis. Takes around twenty seconds,
because it genuinely waits for Redis keys to expire.

This is the one that matters. It is the only proof that the escalation timing is
event-driven rather than polled. The suite fails immediately in `beforeAll` if Redis is
not publishing keyspace expiry events, so a pass means a key expired, Redis published
`__keyevent@0__:expired`, the listener caught it, and the tier was promoted. No polling
loop could pass this test, because there is no polling loop.

## Layer 3: the scripted demonstration

Two terminals.

```bash
npm run dev                       # terminal one, leave it running
npm run demo -w @mzazicare/api    # terminal two
```

The script narrates the whole lifecycle. Each step prints what happened and then a
`proves:` line, so you can read it aloud during a defence. In order it:

1. Checks Postgres and Redis separately, so a failure names which one is down.
2. Prints the care chain, showing the escalation order is rows in the database rather
   than a hard-coded sequence.
3. Shortens the tier-one window to five seconds by updating `escalation_rules`, and
   restores the original values in a `finally` block so a crash cannot leave the
   database altered. This is itself a demonstration: the timeouts are configuration.
4. Raises the alert and prints the six severity factors with their weights, measured
   values and contributions, and the resulting score and band.
5. Shows tier one dispatched immediately, with a millisecond timing.
6. Waits out the five seconds and shows the state move to `ESCALATED`.
7. Acknowledges as the family member and prints the measured response time.
8. Resolves with an outcome, then prints the audit trail as a table with system actions
   distinguishable from human ones.
9. Prints every delivery attempt, including failures with their reason.

Run it twice. The timings will differ slightly, which is worth pointing out: the
numbers are measured rather than printed.

### With real providers

This is what makes it stop being a simulation. Stop the API, then restart it with both
real adapters switched on, with the Africa's Talking simulator open in a browser:

```bash
PUSH_PROVIDER=fcm SMS_PROVIDER=africastalking npm run dev
```

Run the demo again. Firebase authenticates with the real service account and rejects
the seeded fake device token as a permanent failure, so the processor does not retry
it, marks it undelivered and queues the SMS fallback, and the simulator receives the
message. That one sequence demonstrates the whole fallback design against two live
third parties.

Pass these per run rather than writing them into `.env`, so the test suites stay
deterministic.

## Layer 4: the dashboard, by hand

Start everything as described in [running.md](running.md), then sign in as
`+254700000001` with `Dev!2026`.

### The live board

Leave the board open and run the demo in another terminal. Without touching refresh you
should see:

1. A new row appear for Grace Wanjiru.
2. The severity and score in the severity column.
3. The **Time left** column counting down, once a second.
4. The state pill change from `notified` to `escalated` when the window expires.
5. The **Answered by** column fill in when the demo acknowledges.
6. The row leave the board when the demo resolves it.

The word **Live** in the top right is the socket connection. If it says **Not receiving
updates**, the socket dropped, and the board tells you rather than quietly going stale.

### The event detail

Click the elder's name on any row, or use the history view to open a closed one.

Check that the timeline reads as a sequence of offsets from the alert, that entries with
no person against them are the system acting on its own, that the severity table adds up
to the score shown at the top, and that the delivery table shows a failed push followed
by an SMS to the same person when the real providers were used.

### The history view

Filter by state `ESCALATED` and severity `CRITICAL`, then clear the filters. The
filters are applied by the API, so open the browser's network tab and confirm the query
string changes rather than the page simply hiding rows.

### Reporting

Check that the median and mean response times differ once you have a few emergencies,
that the sample size is shown next to them, and that the channel table has a row per
channel.

### Access control, which is worth demonstrating deliberately

Open `apps/api/requests.http` in VS Code, with the REST Client extension installed. A
**Send Request** link appears above each block.

Sections 11 and 12 fail on purpose: a request with no token, a request with a valid
token but the wrong role, two identical-looking login failures for a wrong password and
a non-existent account, and a replayed refresh token. The identical failures prove the
API does not disclose which accounts exist. The replay proves refresh rotation
invalidates the old token.

Section 14 shows what the dashboard cannot do: an administrator is refused acknowledge
and request-responder, because they are not part of that elder's care chain, and a
caregiver is refused the reporting endpoint, because that one is restricted by role.
Access control you can only describe is weaker than access control you can fail on
demand.

## Continuous integration

Every push to `main` and every pull request runs four jobs on GitHub Actions: the
contrast gate, the API lint, typecheck, tests and build, the dashboard tests and
production build, and the escalation integration suite against real services.

This matters for more than tidiness. The production build is verified on a clean
machine that nobody has configured by hand, so it cannot come to depend on something
only one laptop has.
