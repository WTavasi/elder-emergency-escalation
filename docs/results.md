# Results

What was tested, what passed, and what the tests do not show. The raw evidence for every
figure here is in [`evidence/`](evidence).

## Summary

| Check | Result |
| --- | --- |
| System tests TC-01 to TC-12 | **12 of 12 passed** (9 November 2026) |
| Backend unit tests | 914 passed, in 74 suites |
| Backend integration tests, on real PostgreSQL and Redis | 21 passed, in 3 suites |
| App tests (Flutter) | 388 passed |
| Console tests | 94 passed, in 16 files |
| API collection (Postman, run through Newman) | 75 requests, 109 assertions, none failed |

The unit, app and console totals are from 14 November 2026, on the code as it is now. The
integration and Newman totals are from the system test run.

## The system tests

Twelve scripted tests, run against a built API with a fresh, seeded PostgreSQL database
and Redis. Each one records the requests made, the answers, and the rows read back from
the database. Full report:
[evidence/2026-11-09-system-tests-rerun](evidence/2026-11-09-system-tests-rerun/README.md).

| Test | What was tested | Key result | Verdict |
| --- | --- | --- | --- |
| TC-01 | Raising an emergency from the app | Record created and the first group asked 35 ms later | Pass |
| TC-02 | Severity assessment | Scores were the sum of their recorded factors, and rose when the alert was left to run (30 to 60, Critical) | Pass |
| TC-03 | Escalation when nobody answers | Moved to the next group 57 ms after a 10 second limit | Pass |
| TC-04 | Answering before the limit | Recorded, and no escalation 18 seconds later | Pass |
| TC-05 | Two or three people answering at once | One accepted, the others refused; consistent in 20 of 20 trials | Pass |
| TC-06 | Notifications | Every message queued and its attempt recorded; a failed push was replaced by a text | Pass |
| TC-07 | Answering by text | "Nakuja dakika kumi" took the alert on with a 10 minute estimate | Pass |
| TC-08 | Live updates | The elder's circle and the administrator received the change in 16 ms; an outsider received nothing | Pass |
| TC-09 | Access control | Six attempts without a relationship or role all refused, and nothing disclosed | Pass |
| TC-10 | Changing the escalation policy | Eight invalid changes refused with reasons; four valid changes saved, recorded and used by the next alert | Pass |
| TC-11 | Closing an emergency | Closed with its outcome in the audit trail; a second close refused | Pass |
| TC-12 | A whole emergency, start to finish | Every step persisted in order, and identical after restarting the API | Pass |

TC-10 failed in the [first run](evidence/2026-11-09-system-tests/README.md), because the
policy editor did not exist yet. It was built, and the whole set was run again. The first
run is kept as the record of that.

## Automated tests

Five layers, described in [testing](testing.md):

1. **Unit tests** for the API and the console.
2. **App tests**, which also check the accessibility floors: touch target sizes and text
   that still fits at larger sizes.
3. **Integration tests** against real PostgreSQL and Redis, with the safety-net sweep
   switched off, to prove escalation is driven by timer events.
4. **A scripted demonstration** of a whole emergency.
5. **By hand**, in the app and the console.

On every pull request, GitHub Actions runs the design tokens' contrast check, the API's
lint, type check, unit tests and build, the console's tests and production build, the
app's analysis and tests, and the integration suite. A second workflow builds the
Android and iOS apps. Coverage is shown on each run's summary page.

## Dependencies

`npm audit` was run before and after an update round: critical findings went from 1 to 0
and high from 11 to 3. The three left are in a build-time tool, not the running server.
See [evidence/2026-11-09-dependency-audit](evidence/2026-11-09-dependency-audit/README.md).

## What these results do not show

- **Real delivery.** Push notifications and text messages went to logging providers, not
  to real phones. The Firebase and Africa's Talking integrations exist and are unit
  tested, and need a deployment to prove.
- **Load.** Nothing was measured with many emergencies at once.
- **A deployment.** Everything ran on one machine, without HTTPS.
- **Voice on real devices.** The Siri and Android Assistant code has not been compiled on
  a Mac or tried on a phone. The speech pipeline was tested against a stand-in for the
  Whisper server.
- **Real users.** No elders or caregivers took part in testing.

## What was built, against the plan

All phases of the [roadmap](roadmap.md) are built except adaptive escalation (learning
each person's reliability and sizing waits to them), which was set aside to come back to.
