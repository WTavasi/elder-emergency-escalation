# System tests TC-01 to TC-12, rerun: results and evidence

The tests ran on 9 November 2026, from 15:09:21 to 15:10:35 UTC (18:09 to 18:10 in Nairobi). They ran
against the code that adds the escalation policy editor, contact reordering and several phones per
account. **All twelve passed.** TC-10, which failed in the first run because the editor did not
exist, now passes against its requirement.

This run replaces the first run (`../2026-11-09-system-tests/`) as the result to report. The
first run is kept as it was, because it is the record of TC-10 failing before the editor was
built.

## Environment

Same as the first run: a local, controlled environment, not a deployment.

| Item | Value |
| --- | --- |
| Runtime | Node.js 22.22.0 |
| API | Built with `npm run build`, run as `node dist/main.js` on port 3100 |
| Database | PostgreSQL 16.15, a fresh `mzazicare_systest` with all migrations (including `20261111120000_policy_editor` and `20261112120000_user_devices`), seeded with the synthetic accounts |
| Cache and timers | Redis 7.0.15, key-expiry notifications on, flushed before the run |
| Push and SMS | The logging providers: no real phone was registered, and texts go to the API log |
| Changed for the run | `CHECK_INS_ENABLED=false`. Every escalation deadline was set to 10 s at the start (TC-03 needs a shortened deadline) and put back at the end; `environment.json` has the rules before, during and after |

The procedure is the one in the first run's README. The commands are in
`scripts/system-tests/`.

## Results

| Test ID | Traceability | Test scenario | Expected result | Actual result and evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| TC-01 | Emergency initiation | Initiate an emergency through the mobile application | A record is created and the initial response begins | 201. Stored with trigger PANIC, EVENT_CREATED entering TRIGGERED, tier 1 dispatched 35 ms later (TRIGGERED → NOTIFIED). `TC-01.json` | Pass |
| TC-02 | Severity assessment | Create an emergency with configured severity factors | A score calculated and recorded by the configured rules | Grace 30 then 60 (CRITICAL), Ali 15 then 45 (ELEVATED), each the sum of its recorded factors. `TC-02.json` | Pass |
| TC-03 | Escalation | Let an acknowledgement deadline expire | Moves to the next level | Escalated 57 ms after a 10 s deadline, and tier 2 was notified. `TC-03.json` | Pass |
| TC-04 | Escalation and acknowledgement | Acknowledge before the deadline | Recorded, with no escalation | Acknowledged before the deadline; still at tier 1, and nobody at tier 2 told, 18 s later. `TC-04.json` | Pass |
| TC-05 | Concurrent responses | Simultaneous acknowledgements | One accepted, consistent state | 200 and 409, one ACKNOWLEDGED entry. Series: 20 of 20 trials consistent with three people at once (Mary 10, Lucy 7, Kevin 3). `TC-05.json`, `TC-05-series.json` | Pass |
| TC-06 | Notification | Process a notification | Queued, then the attempt recorded | Six rows over tiers 1 to 3, none left queued. Each push was FAILED ("no registered device") and replaced by an SMS SENT with a provider id. `TC-06.json` | Pass |
| TC-07 | SMS interaction | An inbound SMS reply | Interpreted and acted on | "Nakuja dakika kumi" acknowledged the alert as Peter, `via: sms`, `etaMinutes: 10`, and the confirmation was texted. `TC-07.json` | Pass |
| TC-08 | Real-time update | Change an active emergency's status | Connected clients in the circle receive it | Family and administrator received ACKNOWLEDGED in 16 ms; the outsider received nothing. `TC-08.json` | Pass |
| TC-09 | Access control | Access without a relationship or role | Denied, nothing disclosed | 404, 403, 404, not listed, 403 and 401; the alert was unchanged. `TC-09.json` | Pass |
| TC-10 | Administrative management | Modify an authorised system configuration | The change is validated, saved and made available to the relevant process | Eight invalid changes refused with reasons and nothing saved; four valid changes saved and recorded with the administrator; the next alert escalated on the new 15 s limit and was scored with the new weight and bands. Details below. `TC-10.json`, `console/` | **Pass** |
| TC-11 | Emergency resolution | Resolve an active emergency | Status updated, resolution in the audit history | RESOLVED with outcome and time, a RESOLVED entry with actor and state change, a second resolve refused (409). `TC-11.json` | Pass |
| TC-12 | Integration and audit | A controlled emergency lifecycle | Actions, escalations and status changes persisted and reviewable | All steps in order, state changes ∅ → TRIGGERED → NOTIFIED → ESCALATED → ACKNOWLEDGED → RESOLVED, both tiers' notifications, 10 trail entries through the API; identical after an API restart. `TC-12.json`, `TC-12-after-restart.json` | Pass |

## TC-10 in full: modify an authorised system configuration

- **Requirement:** an administrator can change the system's configuration, and the change is
  validated, saved and made available to the process that uses it.
- **Date and time:** 9 November 2026, 15:10:03 to 15:10:19 UTC.
- **Test data and conditions:** Asha Njeri, the seeded administrator, signed in. Configuration
  as seeded, with each tier's deadline at the run's 10 s.
- **Procedure:** every step goes through the API exactly as the console's Escalation policy page
  calls it, and the stored rows are read from PostgreSQL.

### Validated

The editor refuses changes that would break the system and gives a reason for each. Nothing is
saved for any of them: `policy_changes` stayed empty and the Standard tier 1 rule was unchanged.

| Change attempted | Answer |
| --- | --- |
| A time limit on the last tier | 400. "The last tier is the end of the chain, so it has no time limit." |
| No time limit on tier 1 | 400. "Every tier but the last needs a time limit, or the alert would stop climbing." |
| A 5 s time limit | 400. "The time limit must be at least 15 seconds." |
| Tier 1 asked alongside a tier before it | 400. "Tier 1 is asked first, so it cannot be asked alongside a tier before it." |
| High from 70, Critical from 40 | 400. "High must start below Critical." |
| Critical from 101 | 400. "Critical must start at 100 or less." |
| A weight of 150 | 400. "The weight must be at most 100." |
| A weight for a factor that does not exist | 404. "There is no severity factor called "phase_of_the_moon"." |

Only an administrator may change it: a caregiver got 403, and a request without signing in got 401.

### Saved

| Change | Answer | Stored | Recorded in `policy_changes` |
| --- | --- | --- | --- |
| Standard tier 1, 10 s → 15 s | 200, with the new value | `escalation_rules` 15 | Asha Njeri, 15:10:03.417, before and after |
| High tier 1, 10 s → 15 s | 200 | 15 | 15:10:03.427 |
| Care level weight 30 → 50 | 200 | `severity_factors` 50 | 15:10:03.436 |
| High from 35 → 25 (Critical 60) | 200 | `policy_settings` 25 and 60, set by Asha Njeri | 15:10:03.445 |

`GET /admin/policy` returns the change list with the administrator's name, which is what the
console shows.

### Made available to the process that uses it

- **Escalation:** the next alert, Hannah's (Standard), gave tier 1 a 15 000 ms window (it had
  been 10 s). With nobody answering, it moved to tier 2 15 795 ms after tier 1 was asked.
- **Severity:** the next alert, Joseph's (assisted), was scored with care level weight 50 × 0.5 =
  25, plus 5 for a recent alert, giving 30. With High now starting at 25 it was **High**. Under the
  old settings (weight 30, High from 35) it would have scored 20 and been Standard.

### In the console

The `console/` screenshots show the page with a live API and database:

- `01-policy-page.png`: the page as loaded.
- `02-saved.png`: Critical tier 1 changed from 60 to 45, "Critical tier 1 saved. It applies from the
  next alert.", and the change at the top of the list with the administrator's name.
- `03-refused.png`: High from 70 refused in the bands section, "High must start below Critical."
- `04-restored.png`: changed back to 60.

### Verdict

**Pass.** Each part of the requirement was met and recorded.

**Note:** at the end of TC-10 the script set everything back through the same API. The two tier-1
limits could not go back to the run's 10 s, because 10 s is below the editor's 15 s floor (400).
That is the validation working, not a fault. TC-11 and TC-12 ran with 15 s tier-1 limits, and
both passed. The run's own clean-up then restored the original rules directly, as in the first
run.

## Supporting evidence

| Check | Result | File |
| --- | --- | --- |
| Backend unit tests | 74 suites, 913 tests passed | `supporting/backend-unit.txt` |
| Backend integration tests (real PostgreSQL and Redis) | 3 suites, 21 tests passed | `supporting/backend-integration.txt` |
| App tests (Flutter) | 386 passed | `supporting/app-tests.txt` |
| Console tests | 13 files, 83 tests passed | `supporting/console-tests.txt` |
| Postman collection through Newman, ten folders including the new one | 75 requests, 109 assertions, 0 failed | `supporting/postman-newman.txt` |

## What these tests do not show

- **No delivery to real phones, real SMS or HTTPS.** These need the deployed system.
- **No behaviour under load.**
- **The native builds** (Android and iOS) are proven by the new `Native builds` workflow's first
  runs on GitHub, not here.
