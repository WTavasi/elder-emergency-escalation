# Testing the system

Five layers, weakest to strongest. Run them in this order, because each one assumes
the one before it passed.

| Layer | Command | Needs | Proves |
| --- | --- | --- | --- |
| 1 | `npm test` | nothing | the logic is correct in isolation |
| 2 | `flutter test` in `frontend/mobile` | the Flutter SDK | the app's logic and its accessibility floors |
| 3 | `npm run test:integration -w @mzazicare/api` | Docker | the escalation is genuinely event-driven |
| 4 | `npm run demo -w @mzazicare/api` | Docker, API | the whole lifecycle works end to end |
| 5 | the dashboard and the app, by hand | all four above | a person can see and act on it |

---

## Layer 1: the unit suites

```bash
cd ~/Desktop/Mzazicare
npm test
```

This runs both JavaScript workspaces. Expect roughly:

```
Test Suites: 57 passed, 57 total          <- the API
Tests:       640 passed, 640 total

Test Files  7 passed (7)                  <- the dashboard
     Tests  44 passed (44)
```

The counts move as work lands. What matters is that nothing fails, not that the numbers
match this page.

**If every suite refuses to run** and the output is TypeScript errors about properties
that do not exist, the Prisma client is describing an older schema than the one in the
repository. Run `npx prisma generate --schema backend/prisma/schema.prisma` and try
again. It is the single most common way this command fails.

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

## Layer 2: the Flutter app

Only on the Mac.

```bash
cd ~/Desktop/Mzazicare/frontend/mobile
dart format --line-length 100 lib test
flutter analyze
flutter test
```

All three, in that order, and all three should be clean. `flutter analyze` is configured
to treat a warning as an error, so it either says "No issues found" or it has found
something real.

Expect about 245 tests across 29 files. They cover the API client's headers and its
refresh path, the model parsing including the malformed cases, the elder's alert phases
and what the elder sees while help is coming (who, how long, never where), sharing the
way there (asked for location only when it is turned on, sends at once, stops on
arrival, on a refusal and on signing out), "I'm here" and the arrival on the detail
screen, talking through the app (a token from the API, the microphone on, the elder's
phone announcing who is joining and joining on the speaker by itself, "Not now", hanging
up, a refused or dropped call), the timeline saying "by text",
and the rule that one press raises exactly one emergency, the caregiver list ordering,
each of the four actions with its refetch, sign-up, password reset, the profile, consent,
live updates (a change refreshes only the screens it concerns, a burst becomes one
request, and the poll slows while the socket is up), push registration (once per
account, again for the next person on the phone, never without a Firebase project), the
elder's own page and everybody else's account page (signing out asks first), the daily check-in (the question above the
help button, agreeing to somebody else's set-up, a late answer withdrawing the alert it
raised, setting it up and the last answers on the circle's page, "Missed check-in" on the
caregiver's list and alert page), community volunteers (applying, the availability switch,
nothing about who or where before accepting and nothing after it ends, declining,
agreeing to volunteers for an elder, the elder told who is coming, the circle able to ring
them), the shared components, and the accessibility floors.

The accessibility file is the one worth understanding. It asserts the minimum touch
target and body size against the constants in the generated token file rather than
against numbers typed into the test, so lowering a floor in `tokens.json` cannot quietly
pass a test written to a copy of the old value. It has already caught one real defect:
the panic control computed its floor correctly and then handed it to a widget that
cannot exceed its parent's constraints, so a cramped layout rendered it at 20 points.

Continuous integration runs `flutter analyze` and `flutter test` on every push, with the
design tokens built first. It does not run `dart format`, so run that yourself before
committing.

---

## Layer 3: the integration suite

```bash
docker compose up -d
npm run test:integration -w @mzazicare/api
```

Eight escalation tests, six check-in tests and four volunteer tests against the real
Postgres and the real Redis.
Takes around twenty seconds, because the escalation file genuinely waits for Redis keys
to expire. The check-in file drives the check-in clock by hand with the instant it should
think it is: set up by a caregiver (nothing asked until the elder agrees), asked once
however often the clock runs, reminded once, a standard alert raised at the deadline, and
that alert withdrawn by a late answer. The volunteer file checks that only available
volunteers whose area covers the alert are asked, once; that exactly one of two
volunteers accepting at the same instant wins; that withdrawing asks the other again;
and that who and where are taken back when the emergency ends.

This is the one that matters. It is the only proof that the escalation timing is
event-driven rather than polled. The suite fails immediately in `beforeAll` if Redis is
not publishing keyspace expiry events, so a pass means a key expired, Redis published
`__keyevent@0__:expired`, the listener caught it, and the tier was promoted. No polling
loop could pass this test, because there is no polling loop.

## Layer 4: the scripted demonstration

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
4. Raises the alert and prints the five severity factors with their weights, measured
   values and contributions, and the resulting score and band.
5. Shows tier one dispatched immediately, with a millisecond timing.
6. Waits out the five seconds and shows the state move to `ESCALATED`.
7. Waits for the ten second cancel window to close and shows severity scored again, with
   "did not cancel" now counted, and the band before and after.
8. Acknowledges as the family member and prints the measured response time.
9. Resolves with an outcome, then prints the audit trail as a table with system actions
   distinguishable from human ones.
10. Prints every delivery attempt, including failures with their reason.

Run it twice. The timings will differ slightly, which is worth pointing out: the
numbers are measured rather than printed.

### With real providers

This is what makes it stop being a simulation. Stop the API, then restart it with both
real adapters switched on, with the Africa's Talking simulator open in a browser:

```bash
PUSH_PROVIDER=fcm SMS_PROVIDER=africastalking npm run dev
```

Run the demo again. None of the test accounts has a registered device, so Firebase
cannot deliver the push and the processor records it as a permanent failure, without
retrying, and queues the SMS fallback. The simulator then receives the message. That one
sequence demonstrates the whole fallback design against two live third parties.

Pass these per run rather than writing them into `.env`, so the test suites stay
deterministic.

#### When the simulator shows nothing

Work down this list. Each step rules out one cause.

1. **Read the API's first lines.** It must say `SMS provider: africastalking (sandbox,
   delivers to the simulator only)`. If it says `SMS provider: logging`, it was started
   without `SMS_PROVIDER=africastalking`, and every text is being printed in that
   terminal instead of sent.
2. **Open the simulator for the right number.** Go to https://simulator.africastalking.com,
   enter the number of the person being texted, and press **Launch**. For an alert raised
   by Grace, tier one is Mary, `+254700000020`; tier two is `+254700000030`. A sign-up
   code goes to the number signing up. Messages to any other number do not appear.
   Keep that tab open while you test.
3. **Check the credentials on their own.** With the simulator open for one number, run
   `npm run check:sms -w @mzazicare/api -- +254700000020`. It sends one text using
   `AT_USERNAME` and `AT_API_KEY` from `backend/.env` and prints exactly what Africa's
   Talking answered, without printing the key. `AT_USERNAME` must be `sandbox`, and the
   key must be one generated in the sandbox app, not the live one.
4. **Read the delivery log.** In the console, open the emergency: a failed SMS shows its
   reason. In the terminal, a failure is logged as `SMS delivery failed ... :` followed by
   Africa's Talking's own answer, such as `InvalidPhoneNumber` or `UserInBlacklist`.

A sender id (`AT_SENDER_ID`) is never sent to the sandbox, which would refuse the message,
so it is safe to leave one set for the live account.

**A sign-up or reset code does not arrive.** The app always says a code is on its way,
whatever happened, so that nobody can use it to find out which numbers are registered.
The API's terminal says what really happened, in one line, the moment **Send code** is
pressed:

| The terminal says | What to do |
| --- | --- |
| `Sign-up code sent to +25471…` | Delivered. Check the simulator is launched for exactly that number |
| `No code sent ...: asked again within 30s of the last one` | Wait half a minute and ask again |
| `No code sent ...: 5 codes already sent in the last hour` | Run `npm run dev:clear-limits -w @mzazicare/api` |
| `No code sent ...: it already has an account` | That number is registered. Sign in, or use another number |
| `... code for ... was not delivered`, after an `SMS ... refused:` line | Africa's Talking refused it; the line above gives its reason |
| Nothing at all | The request did not reach the API. Check the app is pointed at it |

Use a Kenyan number in both the app and the simulator, such as `+254711000001`, typed the
same way in both.

## Layer 5: by hand

The API on its own can be exercised by hand with the Postman collection in
`docs/postman/`; [api-testing.md](api-testing.md) walks through it step by step.

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

Open `backend/requests.http` in VS Code, with the REST Client extension installed. A
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

### The app, by hand

With the API running and the app started (Guide C in `running.md`), the sequence that
exercises everything:

1. Sign in as Grace, `+254700000010`. You get the panic control at the larger type scale.
2. Press it. The phone vibrates and the screen turns yellow: a ten second countdown in a
   ring that empties, with **I am all right, stop this** at the bottom.
3. Let it run out. The screen says help is coming, and the dashboard board shows the
   emergency appear.
4. On a second device or simulator, sign in as Mary, `+254700000020`, who is tier one for
   Grace. The alert is at the top of her list with a red border and the word Waiting.
5. Open it and press **I cannot come**. Confirm. The emergency escalates immediately
   rather than waiting out the rest of the window, which is visible on the dashboard as
   the tier changing.
6. Raise another, and this time press **I am on my way**. The list entry changes to say
   Mary is responding, and the dashboard shows the same.
7. Close it with an outcome.

Two refusals worth showing deliberately, because they are the access control working:
declining from an account that was not asked at the current tier returns a 403 with the
server's own wording, and acknowledging one somebody else has already taken returns a
409.

### When the phone cannot connect, by hand

1. Sign in as Grace in the app with the API running, so the app saves her carers'
   numbers on the phone.
2. Stop the API (Ctrl+C in its terminal) and press the help button. After a moment the
   screen says **Not sent yet** under a yellow **No connection** band, with Grace's
   address and the ways to ask: **Text my family**, **Call Mary** and **Call 999**, and
   **Text HELP to MzaziCare** too if the API was started with `AT_SHORTCODE` and
   `SMS_INBOUND_TOKEN`. Each opens the phone's messages app or dialler, filled in.
3. Start the API again. Within 15 seconds the alert goes through by itself and the
   screen moves to the yellow ten-second countdown.

### Where the emergency is located, by hand

Section 16 of `backend/requests.http` is the clearest demonstration that severity is
computed from data. Raise an alert, read the away-from-home factor in the breakdown and
see it contribute zero. Record a stay away from home through the caregiver's endpoint.
Raise an identical alert and watch the same factor contribute, the score rise, and the
alert carry a human place name. Nothing about the request changed between the two.

---

## Continuous integration

Every push to `main` and every pull request runs five jobs on GitHub Actions: the
contrast gate, the API lint, typecheck, tests and build, the dashboard tests and
production build, the mobile app's `flutter analyze` and `flutter test`, and the
escalation integration suite against real services.

This matters for more than tidiness. The production build is verified on a clean
machine that nobody has configured by hand, so it cannot come to depend on something
only one laptop has.

**Layer 2 joined late.** Until the fifth job was added, nothing ran the Flutter checks,
and the accessibility floor described above was failing on `main` for a fortnight
because the only thing that would have caught it was a command somebody had to remember
to type. The mobile job builds the design tokens first, because the app reads them as a
generated Dart package that is not committed, and pins Flutter to the version the app is
developed on.
