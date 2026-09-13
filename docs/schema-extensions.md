# Where the schema goes beyond Figure 4.4

The implemented schema is derived from the Chapter 4 Entity Relationship Diagram, but
building the escalation engine, the severity policy and the consent requirement needs
more than the six entities drawn there. Every difference is listed below so Chapter 4 can
be brought back into agreement with the code rather than quietly diverging from it.

Two new tables, one renamed concept, and a set of new columns. Nothing in Figure 4.4 was
removed, and no relationship in it changed.

## New tables

### `severity_factors`

The weighted severity policy, one row per factor, editable by an administrator. Six rows:
care level 30, no cancel in the grace window 30, time of day 15, caregiver outside cover
10, away from home 10, recent activity 5.

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

## New columns on existing tables

| Table | Columns | Why |
|---|---|---|
| `users` | `refresh_token_hash`, `refresh_token_updated_at` | SHA-256 of the current refresh token, never the token. Gives rotation, replay detection and revocation without a sessions table, matching the one-device-per-user simplification |
| `users` | `push_token`, `push_token_updated_at` | FCM needs a device target. One device per user in this build |
| `users` | `care_level` | Severity input. Operational dependency level set by a caregiver, not a clinical field |
| `users` | `home_latitude`, `home_longitude`, `home_address_label` | The registered home, needed for the away-from-home factor |
| `users` | `coverage_area_name`, `coverage_latitude`, `coverage_longitude`, `coverage_radius_km` | The physical form of `coverage_area` from Figure 4.4. A named area plus a circle, matched by Haversine distance, which avoids adding PostGIS for one query |
| `users` | `timezone`, `updated_at` | Time-of-day factor is evaluated in the elder's own timezone |
| `care_assignments` | `cover_days_of_week`, `cover_start_minute`, `cover_end_minute` | Declared cover, the caregiver-availability severity factor. Declared availability, never verified presence, and the column names say so |
| `emergency_events` | `severity`, `severity_score`, `severity_factors` | The band, the score, and the factor values that produced it, so every escalation decision stays explainable |
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

## Suggested Chapter 4 revisions

1. Add `severity_factors` and `consent_records` to Figure 4.4, both without foreign keys
   in the first case and with two foreign keys to `users` in the second.
2. Add a sentence to the `users` narrative noting that `care_level` and the home location
   columns are elder-only, in the same way `coverage_area` is responder-only. That is the
   same flattening argument already made, extended to two more fields.
3. Section 4.4.1 gains the enum definitions, the split location columns, and the index
   table above.
