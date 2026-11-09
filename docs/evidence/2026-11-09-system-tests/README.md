# System tests TC-01 to TC-12: results and evidence

Run on 9 November 2026, 13:46 to 13:48 UTC (16:46 to 16:48 in Nairobi), against commit
`bfac3d2`. Eleven tests passed and one failed (TC-10, because the administrator editor for
rules and weights is not built).

## Environment

| Item | Value |
| --- | --- |
| Where | Local, controlled test environment (a Linux container), not the deployed system |
| Operating system | Linux 6.18 |
| Runtime | Node.js 22.22.0, the version CI uses |
| API | Built with `npm run build` and run as `node dist/main.js` on port 3100 |
| Database | PostgreSQL 16.15, a dedicated database `mzazicare_systest`, all migrations applied, then seeded with the synthetic accounts (`npm run db:seed`) |
| Cache and timers | Redis 7.0.15 with key-expiry notifications on (`notify-keyspace-events Ex`), flushed before the run |
| Push | The logging provider. No seeded account has a registered phone, so every push fails with "no registered device", which exercises the fallback to SMS |
| SMS | The logging provider, standing in for the Africa's Talking sandbox: texts are written to the API log instead of sent. Inbound replies were posted to `/api/v1/sms/inbound` exactly as the gateway posts them, with `SMS_INBOUND_TOKEN` set |
| Changed for the run | `CHECK_INS_ENABLED=false`, so no scheduled check-in could raise an alert in the middle of a test. Every escalation deadline was set to 10 seconds for the run (TC-03 asks for a shortened deadline) and put back afterwards; `environment.json` records the rules before, during and after |
| Unchanged | Cancel window 10 s, severity bands (ELEVATED from 35, CRITICAL from 60), the five seeded severity weights (care level 30, no cancel in the window 30, time of day 20, away from home 15, recent alert 5) |
| Test data | Synthetic seeded people only. Password `Dev!2026` for every account |

## Procedure

From the repository root, with PostgreSQL and Redis running:

```bash
# A clean database
createdb mzazicare_systest
export DATABASE_URL=postgresql://mzazicare:mzazicare@localhost:5432/mzazicare_systest
(cd backend && npx prisma migrate deploy && npm run db:seed && npm run build)

# The API, for the run
redis-cli flushall
(cd backend && PORT=3100 SMS_INBOUND_TOKEN=systest-inbound-0123456789abcdef \
  CHECK_INS_ENABLED=false node dist/main.js > ../docs/evidence/2026-11-09-system-tests/api.log 2>&1 &)

# The tests
export API_URL=http://localhost:3100/api/v1 SMS_INBOUND_TOKEN=systest-inbound-0123456789abcdef \
  EVIDENCE_DIR=docs/evidence/2026-11-09-system-tests NODE_PATH=$PWD/node_modules
node scripts/system-tests/run-system-tests.mjs
TRIALS=20 node scripts/system-tests/tc-05-series.mjs
```

The scripts are in `scripts/system-tests/`. Each test signs in as the seeded people,
calls the API exactly as the app does, and reads the database directly to check what was
stored. Every request, response, database snapshot and live message is in that test's
JSON file. For TC-12 the API was then stopped and started again, and the same record was
read back (`TC-12-after-restart.json`).

## Results

| Test ID | Traceability | Test scenario | Test data and conditions | Expected result | Actual result and evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| TC-01 | Emergency initiation | Initiate an emergency through the mobile application | Francis Odhiambo, an elder with three people in his care circle, signed in; `POST /api/v1/alerts` as the app sends it | An emergency record is created and the initial response process begins | 201 Created. The record was stored with trigger PANIC, and the audit trail shows EVENT_CREATED (entering TRIGGERED). Tier 1 was dispatched 39 ms later and the state moved TRIGGERED → NOTIFIED. Evidence: `TC-01.json` | Pass |
| TC-02 | Severity assessment | Create an emergency with configured severity factors | Grace Wanjiru (high dependency, at home) and Ali Hassan (independent, staying 2 km from home, a stay recorded by his caregiver through `PUT /elders/:id/place`), daytime, no recent alerts | The system calculates and records a severity score according to the configured rules | At creation: Grace 30 (care level 30 × 1), STANDARD; Ali 15 (away from home 15 × 1), STANDARD. When the cancel window passed untouched, both were scored again: Grace 30 + 30 = 60, CRITICAL; Ali 15 + 30 = 45, ELEVATED. Every recorded score equals the sum of its recorded factor contributions, and each evaluation is in the audit trail. Evidence: `TC-02.json` | Pass |
| TC-03 | Escalation | Allow an acknowledgement deadline to expire | Samuel Wanjiru's alert, deadline shortened to 10 s, nobody acknowledges | The emergency progresses to the next configured escalation level | Tier 1 (Mary) was notified with a deadline of 13:46:49.158. The alert moved to tier 2 and ESCALATED was recorded at 13:46:49.226, 68 ms after the deadline, and Samuel's family (tier 2) was notified. Evidence: `TC-03.json` | Pass |
| TC-04 | Escalation and acknowledgement | Acknowledge an emergency before the escalation deadline | Joseph Kimani's alert, Peter Mwangi (his caregiver, tier 1) acknowledges | The acknowledgement is recorded and unnecessary escalation is prevented | Peter acknowledged (200) 9.9 s before the deadline. The record shows ACKNOWLEDGED by Peter. After waiting 18 s, well past the old deadline, it was still at tier 1, nobody at tier 2 had been notified, and the trail has ACKNOWLEDGED and no ESCALATED. Evidence: `TC-04.json` | Pass |
| TC-05 | Concurrent response handling | Submit simultaneous acknowledgement attempts | Esther Muthoni's alert; Mary (caregiver) and Lucy (family) press at the same instant. Then 20 more trials with three people (Mary, Lucy, Kevin) at once | Only one acknowledgement is accepted and the emergency remains in a consistent state | Single trial: one 200 and one 409 Conflict, one ACKNOWLEDGED entry, and the record names the one accepted. Series: 20 of 20 trials consistent (exactly one 200, two 409s, one ACKNOWLEDGED entry, the record naming the accepted person); the winner varied (Mary 12, Lucy 4, Kevin 4), so these were real races. Evidence: `TC-05.json`, `TC-05-series.json` | Pass |
| TC-06 | Notification | Process an emergency notification | Francis's alert from TC-01; push and SMS channels configured (logging providers) | The notification request is queued and its delivery attempt is recorded | Six notification rows, two per tier as the alert climbed tiers 1 to 3. None was left QUEUED. Each push attempt is recorded as FAILED with the reason "no registered device", and each of those recipients was sent an SMS, recorded as SENT with a time and provider id. TIER_DISPATCHED and NOTIFICATION_FAILED are in the trail, and the attempts read back through `GET /alerts/:id`. Evidence: `TC-06.json`, `api.log` | Pass |
| TC-07 | SMS interaction | Submit a supported inbound SMS response | Hannah Kimani's alert; Peter was texted "Reply 1 to go, 2 if you cannot"; he replies in Swahili, "Nakuja dakika kumi" (I'm coming, ten minutes) | The message is interpreted and the relevant emergency action is processed | The gateway call was accepted (200). The reply was read as "coming": the alert was acknowledged by Peter, the audit entry records `via: sms` and `etaMinutes: 10`, and the confirmation text was sent ("thanks. You're going to Hannah. We've told them: in about 10 minutes."). Evidence: `TC-07.json`, `api.log` | Pass |
| TC-08 | Real-time update | Change the status of an active emergency | Live connections (Socket.IO) for Aisha (Grace's family), the administrator, and Peter (not in Grace's circle); Mary acknowledges Grace's alert | Relevant connected clients receive the updated emergency information | Aisha and the administrator each received `emergency.updated` with state ACKNOWLEDGED, 18 ms after the change. Peter received nothing about it. Evidence: `TC-08.json` | Pass |
| TC-09 | Access control | Attempt to access an emergency without an authorised care relationship or role | Peter Mwangi, a signed-in caregiver with no relationship to Grace | Access is denied and emergency information is not disclosed | Reading Grace's alert: 404, with no detail about her. Closing it: 403. Her medical details on it: 404. Grace's alert is not in his list. The administrator's user list: 403. Without signing in: 401. The alert was unchanged by the attempts. Evidence: `TC-09.json` | Pass |
| TC-10 | Administrative management | Modify an authorised system configuration | Asha Njeri, administrator, signed in | The configuration change is validated, saved and made available to the relevant system process | There is no administrator function for changing the escalation rules or severity weights: every candidate endpoint answered 404, and only the read-only `GET /dashboard/policy` exists. The console has no such screen. This is issue #60 (FR-15). Supporting observation only: the scoring process does read the stored weights for each alert (a weight changed directly in the database was used on the next alert), but that bypasses validation and is not an administrator function. Evidence: `TC-10.json` | Fail |
| TC-11 | Emergency resolution | Resolve an active emergency | Grace's alert, acknowledged by Mary in TC-08; Mary resolves it with outcome HANDLED_AT_HOME and a note | The emergency status is updated and the resolution action is recorded in the audit history | 200. The record shows RESOLVED, the outcome and a resolution time. The audit trail has RESOLVED with Mary as actor, ACKNOWLEDGED → RESOLVED, and the note. A second attempt to resolve it was refused (409). Evidence: `TC-11.json` | Pass |
| TC-12 | Integration and audit | Complete a controlled emergency lifecycle | PostgreSQL and Redis running; Ali Hassan's alert goes unanswered at tier 1, Amina (family, tier 2) takes it on and resolves it; then the API is restarted | Emergency actions, escalation events and status changes are persisted and available for review | The trail holds every step in order: EVENT_CREATED, SEVERITY_EVALUATED, TIER_DISPATCHED, ESCALATED, ACKNOWLEDGED, RESOLVED. The persisted state changes run ∅ → TRIGGERED → NOTIFIED → ESCALATED → ACKNOWLEDGED → RESOLVED, with notifications for both tiers. The administrator read the whole record (10 trail entries) through the API. After the API was stopped and started again, the same record read back identical on all eight compared fields. Evidence: `TC-12.json`, `TC-12-after-restart.json` | Pass |

## The record of each test

Every test ran in the environment above, with the procedure above. The times are UTC on
9 November 2026.

### TC-01: Initiate an emergency

- **Date and time:** 13:46:28
- **Procedure:** Francis Odhiambo signs in. `POST /api/v1/alerts` with an empty body, as the app sends it. Then the stored record and the audit trail are read from PostgreSQL.
- **Expected:** a record is created and the initial response begins.
- **Actual:** 201 Created, and the record was stored with trigger PANIC. EVENT_CREATED was written entering TRIGGERED. TIER_DISPATCHED followed 39 ms later, and the state moved to NOTIFIED. Tier 1 is asked straight away, with the 10-second cancel window running alongside it.
- **Verdict:** Pass
- **Evidence:** `TC-01.json` (request, response, record and audit trail)

### TC-02: Severity from the configured factors

- **Date and time:** 13:46:28 to 13:46:39
- **Procedure:** Caroline records Ali's stay 2 km from home (`PUT /elders/:id/place`). Grace and Ali each raise an alert. The scores are read at creation and again after the cancel window closes. Each is checked against the configured weights and against the sum of its own recorded factor contributions.
- **Expected:** a score calculated and recorded according to the configured rules.
- **Actual:** Grace scored 30, STANDARD, then 60, CRITICAL. Ali scored 15, STANDARD, then 45, ELEVATED. All four match the configured rules exactly, and each evaluation is in the audit trail with its factors.
- **Verdict:** Pass
- **Evidence:** `TC-02.json` (configured weights, both records at both moments, the factor breakdowns, the audit entries)
- **Note:** the server locates an alert from the account (a recorded stay, else the home), not from the phone's coordinates, by design. So "away from home" was set up as the system sets it: a stay recorded by the caregiver.

### TC-03: A deadline expires

- **Date and time:** 13:46:39 to 13:46:49
- **Procedure:** escalation deadlines are set to 10 s for the run. Samuel raises an alert, nobody acknowledges, and the record is polled until it moves.
- **Expected:** it moves to the next level.
- **Actual:** the tier 1 deadline was 13:46:49.158. ESCALATED was recorded at 13:46:49.226, 68 ms after it, and the alert is at tier 2 with Samuel's family notified.
- **Verdict:** Pass
- **Evidence:** `TC-03.json`, `environment.json` (the shortened and restored rules)

### TC-04: Acknowledged in time

- **Date and time:** 13:46:49 to 13:47:07
- **Procedure:** Joseph raises an alert. Peter, tier 1, acknowledges as soon as he is notified. The test then waits 18 s, past the old deadline, and reads the record, notifications and trail.
- **Expected:** the acknowledgement is recorded and no escalation follows.
- **Actual:** 200. The record shows ACKNOWLEDGED by Peter, still at tier 1. Notifications went to tier 1 only, and there's no ESCALATED in the trail.
- **Verdict:** Pass
- **Evidence:** `TC-04.json`

### TC-05: Simultaneous acknowledgements

- **Date and time:** 13:47:07 (single trial); series finished 13:48:27
- **Procedure:** for Esther's alert, two acknowledgement requests are sent in the same instant (`Promise.all`). Then `tc-05-series.mjs` runs 20 trials with three people pressing at once.
- **Expected:** one accepted, a consistent state.
- **Actual:** single trial: 200 and 409, one ACKNOWLEDGED entry, the record naming Mary. Series: 20 of 20 consistent, with the accepted person varying (Mary 12, Lucy 4, Kevin 4).
- **Verdict:** Pass
- **Evidence:** `TC-05.json`, `TC-05-series.json`

### TC-06: Notification processing

- **Date and time:** 13:47:07
- **Procedure:** the notification rows for Francis's alert are read once none is queued. Then the alert detail is read through the API as the administrator.
- **Expected:** queued, then the delivery attempt recorded.
- **Actual:** six rows across tiers 1 to 3. Each push is FAILED with "no registered device", and each of those recipients has an SMS SENT with a time and a provider id. None was left in the queue.
- **Verdict:** Pass
- **Evidence:** `TC-06.json`, `api.log` (the `[NotificationsProcessor]` and `[LoggingSmsProvider]` lines)
- **Limitation:** no real push was delivered, because no real phone was registered, and the SMS provider logs instead of sending. Delivery to real phones is for the notification-reliability series on the deployed system.

### TC-07: An inbound SMS reply

- **Date and time:** 13:47:07
- **Procedure:** Hannah raises an alert and Peter is texted. `POST /api/v1/sms/inbound?token=…` with `{ from: Peter's number, text: "Nakuja dakika kumi" }`, as Africa's Talking posts it.
- **Expected:** the reply is interpreted and acted on.
- **Actual:** 200. The alert was acknowledged by Peter through SMS with a 10-minute ETA, and the confirmation text was sent.
- **Verdict:** Pass
- **Evidence:** `TC-07.json`, `api.log` (the alert text and the confirmation)
- **Limitation:** the request came from the test script, not from the Africa's Talking simulator, which needs a public address (see `docs/running.md`, Step 9).

### TC-08: Live updates

- **Date and time:** 13:47:07 to 13:47:10
- **Procedure:** three Socket.IO clients connect to `/realtime` with their access tokens. Mary acknowledges Grace's alert, and the `emergency.updated` messages are collected for 1.5 s.
- **Expected:** relevant clients receive the update.
- **Actual:** Aisha and the administrator each received it after 18 ms, with state ACKNOWLEDGED. Peter received nothing.
- **Verdict:** Pass
- **Evidence:** `TC-08.json` (every message each client received)

### TC-09: Access without a relationship

- **Date and time:** 13:47:10
- **Procedure:** as Peter: read, close, read the medical details of, and list Grace's alert, then request the administrator's user list. Then read the alert without signing in.
- **Expected:** denied, nothing disclosed.
- **Actual:** 404, 403, 404, not listed, 403 and 401 respectively. No detail about Grace appeared in any answer, and the alert was unchanged.
- **Verdict:** Pass
- **Evidence:** `TC-09.json`

### TC-10: Change a configuration as administrator

- **Date and time:** 13:47:10
- **Procedure:** signed in as the administrator, the script tries the endpoints an editor for escalation rules and severity weights would use. As a supporting observation, a weight is changed directly in the database, an alert is raised and then cancelled, and the weight is put back.
- **Expected:** a change validated, saved and taken up by the system.
- **Actual:** no such function exists (404 for each). Only `GET /dashboard/policy`, which is read-only, is available, and the console has no editor. The direct database change was used by the next alert (care level weight 31), so the scoring process reads the stored policy, but nothing validates such a change or lets an administrator make it.
- **Verdict:** Fail. The requirement is not implemented (issue #60, FR-15).
- **Evidence:** `TC-10.json`

### TC-11: Resolve an emergency

- **Date and time:** 13:47:10
- **Procedure:** Mary resolves Grace's alert (`POST /alerts/:id/resolve`, outcome HANDLED_AT_HOME, with a note). The record and trail are read, then she resolves it again.
- **Expected:** the status is updated and the resolution is in the audit history.
- **Actual:** 200, RESOLVED with outcome and time. A RESOLVED entry records Mary, ACKNOWLEDGED → RESOLVED and the note. The second attempt got 409.
- **Verdict:** Pass
- **Evidence:** `TC-11.json`

### TC-12: A whole lifecycle, persisted

- **Date and time:** 13:47:10 to 13:47:20; restart check 13:47:55 to 13:48:06
- **Procedure:** Ali raises an alert, tier 1 does not answer, and it escalates to tier 2. Amina acknowledges and resolves it. The trail, notifications and record are read from PostgreSQL and through the API as the administrator. The API process is then stopped, started again, and the record read back and compared.
- **Expected:** actions, escalations and status changes persisted and available for review.
- **Actual:** all six lifecycle steps are in the trail in order, along with every state change, notifications for both tiers, and 10 trail entries readable through the API. The record was identical before and after the restart.
- **Verdict:** Pass
- **Evidence:** `TC-12.json`, `TC-12-after-restart.json`, `api-after-restart.log`

## Supporting evidence

The automated suites, run on the same commit straight after:

| Suite | Result | File |
| --- | --- | --- |
| Backend unit tests | 72 suites, 884 tests passed | `supporting/backend-unit.txt` |
| Backend integration tests (real PostgreSQL and Redis) | 3 suites, 21 tests passed | `supporting/backend-integration.txt` |

## Observations

- **One test fails:** TC-10. Either build the editor (#60), formally descope it with your supervisor, or report it as unmet.
- **A small redundancy in the trail:** when an alert moves up a tier, the TIER_DISPATCHED entry repeats the state change already recorded by the ESCALATED entry just before it (NOTIFIED → ESCALATED twice in TC-12). Nothing is lost or wrong, but a reader counting state changes would count it twice.
- **What these tests do not show:**
  - Delivery to real phones, real SMS sending, and HTTPS: these need the deployed system.
  - Behaviour under load.
  - The app's own screens, which have their own widget tests (384).
- **Preliminary run:** the first attempt is kept in `preliminary-run/`. It failed because of faults in the test script, not the system:
  - wrong seeded phone numbers for four elders;
  - a field name in the live message (`eventId`);
  - phone coordinates where the system locates an alert from a recorded stay;
  - an expectation that the alert would still be TRIGGERED, when tier 1 is asked at once.

  The script was corrected and the database reset before the final run reported here.

## Files

| File | What it holds |
| --- | --- |
| `TC-01.json` … `TC-12.json` | Each test's steps (every request and response), checks with the observed values, database snapshots, and its verdict |
| `TC-05-series.json` | The 20 concurrency trials |
| `TC-12-after-restart.json` | The lifecycle record before and after the API restart |
| `environment.json` | Versions, health check, the escalation rules before, during and after, and the severity weights |
| `results.json` | The verdicts in one list |
| `api.log`, `api-after-restart.log` | The API's own log for the run |
| `supporting/` | The unit and integration suite output |
| `preliminary-run/` | The first attempt, kept for the record |
