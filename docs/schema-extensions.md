# Where the schema goes beyond Figure 4.4

The implemented schema is derived from the Chapter 4 Entity Relationship Diagram, but
building the escalation engine, the severity policy and the consent requirement needs
more than the six entities drawn there. Every difference is listed below so Chapter 4 can
be brought back into agreement with the code rather than quietly diverging from it.

Five new tables, one renamed concept, and a set of new columns. Nothing in Figure 4.4 was
removed, and no relationship in it changed.

## New tables

### `severity_factors`

The weighted severity policy, one row per factor, editable by an administrator. Five
enabled rows: care level 30, no cancel in the grace window 30, time of day 20, away from
home 15, recent activity 5. A sixth, caregiver outside cover, is kept switched off (see
`docs/decisions.md`).

Justification for the report: severity has to come from somewhere defensible. Holding the
weights as data rather than code means the policy can be shown as a table, changed without
a deployment, and audited. Like `escalation_rules`, it has no foreign keys, for the same
reason: it is configuration read by the engine, not a fact about one event.

### `consent_records`

Consent as a record rather than a checkbox state: subject, who granted it, their stated
relationship to the subject, consent type, policy version, granted timestamp, withdrawal
timestamp.

Justification: a caregiver normally registers the elder, so consent is given by one person
on behalf of another. A boolean on `users` cannot express that, and cannot answer the
question the Kenya Data Protection Act 2019 actually asks, which is who consented to what,
when, and on whose authority. Withdrawal is a timestamp rather than a deletion, so the
record of having consented survives the withdrawal.

Deliberately not routed through `audit_logs`: that table is scoped to the lifecycle of an
emergency event, and `event_id` stays mandatory there exactly as Figure 4.4 shows it.

### `chain_invitations`

A place in an elder's chain held for a phone number that has not signed up yet: the elder,
the number, the name the caregiver gave, the rank it will take and who invited them.
Unique per elder and number. Signing up with that number turns every place held for it
into a `care_assignments` row, in the same transaction as the account, and deletes the
invitations.

Justification: without it, adding a family member would require them to have signed up
first, so a caregiver setting up the chain would have to wait for each relative and come
back. A separate table rather than a nullable `responder_id` on `care_assignments` keeps
the chain itself free of half-people: every row dispatch reads is somebody who can
actually be notified.

### `check_in_schedules`

One row per elder who has a daily check-in: whether it is on, the times of day (minutes
after local midnight, up to three), how long the elder has to answer, who set it up, and
when the elder agreed (`confirmed_at`, null while it waits for them). The elder is the
primary key, because an elder has one arrangement or none.

Justification: the times belong to the elder and are read every minute by the check-in
clock, so they are data rather than configuration. `confirmed_at` is how the rule that
the elder agrees to being checked on is enforced rather than merely stated: the clock only
reads rows where it is set, and only asks times that fall after it.

### `check_ins`

One row per check-in actually asked: the elder, when it was due, when the reminder goes
and when the circle is told, its status (`PENDING`, `ANSWERED`, `MISSED`), when and how
it was answered, and the emergency it raised if it was missed. Unique per elder and due
time, so two clocks cannot ask the same check-in twice.

Justification: a missed check-in becomes an emergency, so the record of what was asked
and when has to exist apart from that emergency, and it is what the circle's page shows
as the last week of answers. Answered and missed rows are deleted with the audit log
window; a pending one never is.

## New columns on existing tables

| Table | Columns | Why |
|---|---|---|
| `users` | `refresh_token_hash`, `refresh_token_updated_at` | SHA-256 of the current refresh token, never the token. Gives rotation, replay detection and revocation without a sessions table, matching the one-device-per-user simplification |
| `users` | `push_token`, `push_token_updated_at` | FCM needs a device target. One device per user in this build |
| `users` | `care_level` | Severity input. Operational dependency level set by a caregiver, not a clinical field |
| `users` | `home_latitude`, `home_longitude`, `home_address_label` | The registered home, needed for the away-from-home factor |
| `users` | `current_latitude`, `current_longitude`, `current_place_label`, `current_place_set_at`, `current_place_set_by_id` | Where an elder is staying when it is not their registered home. A deliberate alternative to reading the device's location: an occasional fact recorded by a person in the care circle rather than a continuous trail inferred from a phone. Null means at home, which is the normal case. The away-from-home factor measures against `home_latitude` and `home_longitude`, which never move |
| `users` | `coverage_area_name`, `coverage_latitude`, `coverage_longitude`, `coverage_radius_km` | The physical form of `coverage_area` from Figure 4.4. A named area plus a circle, matched by Haversine distance, which avoids adding PostGIS for one query |
| `users` | `timezone`, `updated_at` | Time-of-day factor is evaluated in the elder's own timezone |
| `users` | `deactivated_at` | An administrator closes an account without deleting it, because every account is named in emergency history that has to stay readable. Null means active. A deactivated account cannot sign in, its sessions end at once, and dispatch passes over its place in a chain. A timestamp rather than a boolean, so the record also says when access ended |
| `care_assignments` | `cover_days_of_week`, `cover_start_minute`, `cover_end_minute` | Reserved for declared cover hours. Not read in this build: the caregiver-cover severity factor was dropped because nothing lets a caregiver declare them. Kept so the factor can return without a migration |
| `emergency_events` | `severity`, `severity_score`, `severity_factors` | The band, the score, and the factor values that produced it, so every escalation decision stays explainable |
| `emergency_events` | `trigger` | `PANIC` for a press of the button, `MISSED_CHECK_IN` for a daily check-in nobody answered. The same lifecycle and chain for both; the trigger changes the wording, holds a missed check-in at the standard band, and lets a late answer withdraw it |
| `emergency_events` | `severity_reviewed_at` | When severity was scored the second time, after the cancel window closed and "did not cancel" could count. Lets the review timer and the sweep both try, and only one succeed. Rows from before the column existed are marked reviewed at their trigger time |
| `emergency_events` | `current_tier_deadline_at` | The durable copy of the Redis timer. Redis publishes an expiry once and never again, so without a recorded deadline a restart at the wrong moment would leave an emergency waiting on a timer that no longer exists |
| `emergency_events` | `acknowledged_at`, `responder_requested_at` | Acknowledgement time is needed for the response-time measurements in Chapter 5. The request timestamp records a manual responder request superseding the automatic chain |
| `escalation_rules` | `severity`, `dispatch_mode`, `sms_fallback_immediate`, `updated_at` | Severity selects a rule set, which is how severity changes policy rather than alert content. Parallel dispatch and immediate SMS are what the critical band actually does |
| `notifications` | `status`, `tier`, `provider_message_id`, `failure_reason`, `created_at` | The SMS fallback fires on push failure, and a null `delivered_at` cannot distinguish "failed" from "not yet delivered" |
| `audit_logs` | `detail` (JSON) | Structured context for an action: the severity factor values, the tier dispatched, the provider error |

## Split attributes

Figure 4.4 lists `alert_location` and `responder_location` as single attributes, leaving
their physical form to Section 4.4.1. They are implemented as decimal latitude and
longitude pairs, with an optional human-readable address label on the alert.

## Indexes worth defending in Section 4.4.1

| Index | Why |
|---|---|
| `emergency_events(state)` | The escalation engine and the dashboard both scan open events by state |
| `emergency_events(elderly_id, triggered_at)` | An elder's history, and the recent-activity severity factor |
| `notifications(event_id)` | Rebuilding the escalation ladder for one event |
| `notifications(status)` | Finding failed dispatches that need the SMS fallback |
| `audit_logs(event_id, occurred_at)` | The event timeline, in order |
| `care_assignments(elderly_id, priority_order)` unique | Two contacts cannot hold the same rank in one chain |
| `care_assignments(elderly_id, responder_id)` unique | The same person cannot appear twice in one chain |
| `check_ins(elder_id, due_at)` unique | One check-in per elder per time, whichever clock gets there first |
| `check_ins(status, deadline_at)` | The clock's every-minute question: which pending check-ins are past their deadline |

## Suggested Chapter 4 revisions

1. Add `severity_factors`, `consent_records` and `chain_invitations` to Figure 4.4:
   `severity_factors` without foreign keys, `consent_records` with two foreign keys to
   `users`, and `chain_invitations` with foreign keys to `users` for the elder and the
   person who sent the invitation.
2. Add a sentence to the `users` narrative noting that `care_level` and the home location
   columns are elder-only, in the same way `coverage_area` is responder-only. That is the
   same flattening argument already made, extended to two more fields.
3. Section 4.4.1 gains the enum definitions, the split location columns, and the index
   table above.
4. Add `deactivated_at` (nullable timestamp) to the `users` entity in Figure 4.4, with a
   sentence in the narrative explaining that accounts are deactivated rather than deleted
   so emergency history keeps every name it refers to.
5. Add `check_in_schedules` (one-to-one with an elder `users` row, plus a nullable foreign
   key to the person who set it up) and `check_ins` (many per elder, with a nullable
   foreign key to the `emergency_events` row it raised), and the `trigger` attribute on
   `emergency_events`.
