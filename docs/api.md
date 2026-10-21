# API reference

Base path `/api/v1`. Health sits outside it, so a platform check has a stable address
that does not move when the version does.

Every route is authenticated unless it declares `@Public()`, so a new endpoint is
protected by default rather than by remembering to protect it.

`backend/requests.http` holds all of these as runnable blocks. Open it in VS Code with
the REST Client extension and a **Send Request** link appears above each one.

## Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Postgres and Redis checked separately; 503 if either is down |
| POST | `/api/v1/auth/verify-phone` | none | Sends a six-digit sign-up code by SMS. Always 202, sent or not |
| POST | `/api/v1/auth/register` | none | Sign-up for caregivers and family members, with the code |
| POST | `/api/v1/auth/login` | none | `{ phone, password }` or `{ email, password }`, returns both tokens |
| POST | `/api/v1/auth/forgot-password` | none | Sends a six-digit reset code to a number with an account. Always 202 |
| POST | `/api/v1/auth/reset-password` | none | `{ phone, code, newPassword }`; signs in and ends every other session |
| GET | `/api/v1/auth/providers` | none | `{ google: { clientId } \| null }`, for the console's sign-in screen |
| POST | `/api/v1/auth/google` | none | `{ idToken }` from Google's button; administrators only |
| POST | `/api/v1/auth/refresh` | none | Rotates the refresh token; a replay revokes every session |
| POST | `/api/v1/auth/logout` | bearer | Ends every session for that user |
| GET | `/api/v1/auth/me` | bearer | The signed-in user |
| PATCH | `/api/v1/auth/me` | bearer | Change your own name or email (`email: null` removes it) |
| POST | `/api/v1/auth/change-password` | bearer | `{ currentPassword, newPassword }`; returns fresh tokens and ends every other session |
| GET | `/api/v1/auth/me/preferences` | bearer | `{ shareWayThere }`, the defaults until something is changed |
| PATCH | `/api/v1/auth/me/preferences` | bearer | Change any of them; only the named fields change |
| PUT | `/api/v1/auth/me/push-token` | bearer | `{ token }`, this phone's FCM address; 204. Moves it from any other account that held it |
| DELETE | `/api/v1/auth/me/push-token` | bearer | Forgets this account's push address; 204. Signing out does the same |

**An elder stays signed in.** Access tokens last the same for everyone, but an elder's
refresh token lasts `JWT_REFRESH_TTL_ELDER` (ten years by default) rather than
`JWT_REFRESH_TTL`, because an elder signed out by a timer is an elder whose panic button
silently stopped working. Every other safeguard still applies: rotation on each refresh,
revocation of every session on a replayed token, and on deactivation.

**One push address per account, one account per address.** Registering an address that
another account held takes it from that account, so a phone handed from one person to
the next never receives the first person's emergencies. The app registers after every
sign-in and whenever Firebase rotates the address.

Elders are registered by a caregiver rather than themselves, because the consent record
has to name who consented on whose behalf (`POST /api/v1/elders`, below). Emergency
responders and administrators are created by an administrator.

**Sign-up takes two requests.** `verify-phone` with `{ phone }` sends a code; `register`
with `{ name, phone, code, password, role, email?, acceptedPrivacyNotice: true }` creates
the account and signs it in. The code is six digits, lives ten minutes
(`VERIFICATION_CODE_TTL_SECONDS`), allows five wrong guesses, and works once. One number
is sent at most one code every 30 seconds and five an hour. A number that already has an
account is sent a message saying somebody tried, instead of a code, and `verify-phone`
answers 202 either way, so it cannot be used to find out who is registered. In
development the SMS provider is the logging one, so the code appears in the API's log.

Signing up also records the privacy consent, and turns any chain place held for that
number into a care assignment.

A wrong password and an unknown phone number produce the same message through the same
code path, so the API cannot be used to discover who is registered. The same holds for an
email address. Given both a phone and an email, the phone is used.

**A forgotten password takes two requests**, the same shape as sign-up. `forgot-password`
with `{ phone }` sends a reset code to a number that has an account and sends nothing to
one that does not, answering 202 either way. `reset-password` with the code and a new
password sets it, issues fresh tokens and so ends any other session at its next refresh.
Reset codes and sign-up codes are kept under separate keys, so one can never be used as
the other; they share the per-number cooldown and hourly limit. The app offers this; the
console does not, because an administrator account is managed by another administrator.

**Google sign-in is for the console, and for administrators only.** The console shows
Google's button when `GOOGLE_CLIENT_ID` is set. The ID token it returns is checked here
against Google's published keys (cached as Google's headers say), for this client ID,
from Google's issuer, unexpired, and for a verified address. The address then has to be
the email on an existing administrator account: nothing is ever created by it, and any
other role is refused, because every other account belongs in the app, where the phone
number is the handle. Setting it up: `docs/running.md`, Google sign-in.

## Emergencies

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/v1/alerts` | elder | Raise an emergency. Empty body. Scores severity and writes the audit trail |
| POST | `/api/v1/alerts/:id/cancel` | elder | Withdraw inside the grace window, while nobody has taken it on |
| POST | `/api/v1/alerts/:id/reopen` | care chain | Restart a cancelled alert nobody could confirm |
| GET | `/api/v1/alerts` | bearer | Emergencies the caller is part of. `q` searches the elder's name and the name of whoever took it on; `from` and `to` bound the date; `offset` pages; the total is in `X-Total-Count` |
| GET | `/api/v1/alerts/:id` | participants | One emergency, with its chain, audit trail and deliveries |
| POST | `/api/v1/alerts/:id/acknowledge` | participants | Take ownership, stopping the chain |
| POST | `/api/v1/alerts/:id/decline` | asked at this tier | Say you cannot come, so the chain moves on at once |
| POST | `/api/v1/alerts/:id/resolve` | participants | Close with a recorded outcome |
| POST | `/api/v1/alerts/:id/request-responder` | participants | Call in the responder now, superseding the chain |
| POST | `/api/v1/alerts/:id/position` | the owner, sharing on | `{ latitude, longitude, accuracyMetres? }` on the way; returns `{ arrived, journey }` |
| POST | `/api/v1/alerts/:id/arrived` | the owner | "I'm here": moves it to `ON_SCENE` and records `arrivedAt` |
| POST | `/api/v1/sms/inbound?token=` | the SMS gateway | A reply to an alert text, as Africa's Talking posts it (`from`, `text`, and others ignored). 404 unless `SMS_INBOUND_TOKEN` is set and matches |

Every query is scoped to the caller's own care relationships, plus any emergency they
were asked about outside them (an emergency responder matched by area). An emergency the
caller is not part of returns 404 rather than 403, so the API does not confirm that an id
exists.

**On the way, and arrived.** A person who turned on "Share my way there"
(`PATCH /auth/me/preferences { shareWayThere: true }`) and took an emergency on can send
their position while they travel. The server works out the time to the elder (an OSRM
route when `ROUTING_PROVIDER=osrm`, otherwise a straight-line estimate), keeps the last
position in Redis for three minutes, and tells the room to re-read. The detail view then
carries `journey`: `{ etaSeconds, distanceMetres, source, updatedAt, latitude, longitude }`,
with the coordinates left out for the elder, who sees the time only. A position within
`ARRIVAL_RADIUS_METRES` (100) of the alert, from a fix at least that precise, counts as
arriving, the same as "I'm here". Arriving moves the emergency to `ON_SCENE`, sets
`arrivedAt`, writes an `ARRIVED` audit entry with the seconds from the alert and from the
acknowledgement, and forgets the position. No position is ever written to the database.
An owner on scene can still call in a responder; `arrivedAt` stays set.

Every alert carries the elder's **phone number**, so a caregiver can ring before deciding
whether to set off, which is the most natural first move on receiving one. It widens
nothing: everybody who can see an alert is already in that elder's care circle, was
notified about the emergency, or is an administrator, and the care circle has the number
already. What it saves is somebody scrolling through their contacts while an emergency is
open. The app hands the number to the phone's own dialler and never places a call itself.

Raising takes **no location**. Where an emergency is happening is resolved by the server
from the elder's own record: a recorded stay away from home if there is one, otherwise the
registered home. Two reasons. The app never reads the device's location, so there is no
location trail to protect or to explain to a research participant; and a client that could
name its own coordinates could name coordinates that raise its own severity score, which
is an input to a safety decision. The optional `latitude` and `longitude` fields on the
request are a fallback for an account whose home was never recorded, which registration
does not yet require, and they come out once it does.

**Answering by text.** With `SMS_INBOUND_TOKEN` set, every alert SMS ends "Reply 1 if
you can go, 2 if you cannot." The gateway posts the reply to `/sms/inbound` with the token
in the address. The sender is matched to an account by number; a number that belongs to
nobody, or to a deactivated account, gets no answer at all. The reply applies to the
newest alert still waiting on that person, and goes through the same acknowledge and
decline as the app, so every rule below holds for it too. The first word is read: `1`,
`yes`, `ndio` accept; `2`, `no`, `hapana` decline; anything else gets the two answers
repeated. The person is texted back: on accepting, the elder's number and address (both
disclosed during an open emergency); if somebody accepted first, who; if the alert moved
past them, that it has. The audit entry carries `via: "sms"`. One phone may send six
replies in ten minutes. The route always answers 200 once the token matches, because a
gateway that sees an error sends the reply again. With `AT_SHORTCODE` set, every SMS is
sent from that shortcode so the reply reaches the number that reads it.

Declining is narrower than the rest. Only the people the **current tier** actually
asked may decline, so a tier two contact cannot decline on tier one's behalf and
somebody outside the chain cannot decline at all. It is refused once anybody has
acknowledged, and it is idempotent, because a retry on a weak signal is not a failure.

"Participants" means the elder, anybody in that elder's care chain, or anybody who was
actually notified. An administrator is **not** a participant, so the three action
endpoints refuse an administrator account. That is deliberate and is covered in
[decisions.md](decisions.md).

### Listing filters

`GET /api/v1/alerts` accepts:

| Parameter | Example | Meaning |
| --- | --- | --- |
| `open` | `?open=true` | only emergencies that are still live |
| `state` | `?state=ESCALATED,NOTIFIED` | one or more states, comma separated |
| `severity` | `?severity=CRITICAL` | one or more severity bands |
| `elderId` | `?elderId=<uuid>` | one elder |
| `from`, `to` | `?from=2026-09-01T00:00:00Z` | raised within a window |
| `limit` | `?limit=100` | page size, capped at 200, default 50 |
| `cursor` | `?cursor=<uuid>` | id of the last row of the previous page |

An unrecognised value is rejected with a 400 naming the field, rather than reaching the
database and surfacing as a 500 that discloses something about the schema.

## Where an elder is staying

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/elders/:id/place` | care chain, administrator | Whether they are at home, and where if not |
| PUT | `/api/v1/elders/:id/place` | care chain, administrator | Record a stay away from home |
| DELETE | `/api/v1/elders/:id/place` | care chain, administrator | Back home |

The alternative to reading the device's location. A stay away from home is an occasional
fact that somebody in the care circle already knows, so it is recorded once by a person
rather than inferred continuously from a phone. Alerts raised during a stay carry that
place, and the away-from-home severity factor measures against the registered home, which
never moves, so the factor still scores.

An elder cannot change this about themselves, deliberately: the control exists for the
people who would know about a stay, and somebody in the middle of an emergency should
never be asked where they are. A caregiver or family member must be in that elder's care
circle; an administrator may reach any elder. Anyone else gets 403, and a non-elder id
gets 404.

`PUT` is idempotent. Clearing a stay still records when it was cleared, so the account
says the person came back rather than losing that a stay ever happened.

## Elders and their chains

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/elders` | caregiver, family | The elders the caller looks after, with their own rank |
| POST | `/api/v1/elders` | caregiver | Register an elder; the caregiver becomes tier one |
| GET | `/api/v1/elders/address-search?q=` | caregiver, family, administrator | Coordinates for an address |
| GET | `/api/v1/elders/:id/chain` | care chain, administrator | Who is asked, in order, and places held for invitees |
| POST | `/api/v1/elders/:id/chain` | caregiver in that chain | Add a family member by phone |
| DELETE | `/api/v1/elders/:id/chain/:entryId` | caregiver in that chain | Remove a family member, or withdraw a held place |
| GET | `/api/v1/elders/:id` | care chain | Name, phone, home, care level, where they are now, and whether the caller may edit |
| PATCH | `/api/v1/elders/:id` | caregiver in that chain | Change their home or care level (`careLevel: null` means not sure) |
| GET | `/api/v1/elders/:id/consent` | the elder, care chain, administrator | What was agreed, by whom, whether the elder confirmed it, what was withdrawn |
| POST | `/api/v1/elders/:id/consent/confirm` | the elder | Agree, for themselves, to what was agreed on their behalf |
| POST | `/api/v1/elders/:id/consent/withdraw` | the elder, caregiver in that chain | `{ type, confirm? }`. `confirm: true` is required for `DATA_PROCESSING` |

**Withdrawn consent** is honoured everywhere data leaves the server, outside an
emergency. An elder's `phone`, home, stay and an alert's location come back as `null`,
with a `withheld` list (`"phone"`, `"location"`) saying why, so a screen can explain
rather than show a blank. While an emergency is open, nothing is withheld from those
responding to it. Withdrawing `DATA_PROCESSING` withdraws everything and deactivates the
account.

**Registering an elder** takes `{ name, phone, code, password, home: { latitude,
longitude, label }, relationship, careLevel?, consentConfirmed: true }`. The elder's phone
is sent a code by `verify-phone` exactly as for sign-up, and the caregiver reads it off
that phone. Three consent rows are written (data processing, location sharing, contact
sharing) naming the caregiver as the one who gave them and `relationship` as how they are
related.

**Adding a family member** takes `{ phone, name? }` and fills the chain's family rank. If
the number has a caregiver or family account, they take the place at once; if it has no
account, the place is held in `chain_invitations` and taken when that number signs up.
Either way they get an SMS saying who added them. Each rank holds one person, so a second
family member is refused with 409 until the first is removed.

**Removing someone** takes the `id` of a chain entry, and each entry says whether it is
`removable`. A family member who had taken their place is sent an SMS saying who removed
them; a held invitation is withdrawn without a message, since nobody was told about it
except at the moment it was made. A caregiver cannot remove themselves or a responder
this way, and nobody can be removed while the elder has an emergency open (409), because
dispatch may be asking them at that moment.

**A wrong current password is 400, not 401.** A 401 tells the app its session has expired
and sends the person back to sign in, when they are signed in and only mistyped.

**Address search** goes from the API to OpenStreetMap's public Nominatim, never from the
app, within its usage policy (https://operations.osmfoundation.org/policies/nominatim/):
one request a second across all users, held in Redis; an identifying User-Agent with the
contact in `GEOCODER_CONTACT`; results cached for a day; searched on a button, never as
the person types; and the attribution returned with every result for the app to show. A
busier deployment should set `GEOCODER_URL` to its own Nominatim.

## Reporting

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard/overview` | administrator | Aggregate figures across every elder |

`?days=30` sets the window, from 1 to 365. Returns live counts, response times as a
median as well as a mean with the sample size, how far emergencies travelled down the
chain, and per-channel delivery reliability. Also `raised` (emergencies in the window),
`previous` (raised, response times and the escalation rate for the window before, of the
same length) and `daily` (one point per day, with the days nothing happened included).

## Accounts

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/users` | administrator | `{ items, total, page, pageSize }`. Filters: `q` (name, phone or email), `role`, `status` (`active` or `deactivated`) |
| POST | `/api/v1/admin/users` | administrator | `{ name, phone, email?, role, password, coverage? }` for a responder or an administrator. A responder needs `coverage: { areaName, latitude, longitude, radiusKm }` |
| PATCH | `/api/v1/admin/users/:id` | administrator | `{ name?, email?, coverage? }` |
| POST | `/api/v1/admin/users/deactivate` | administrator | `{ ids }` |
| POST | `/api/v1/admin/users/reactivate` | administrator | `{ ids }` |

**Accounts are deactivated, never deleted**, because each is named in emergency history.
A deactivated account cannot sign in (by password, Google or a reset; the message says so
only after the password is right), its sessions end at once, including any open live
connection to the console, and dispatch passes over it as if its place in a chain were empty. Deactivating is refused for
your own account, for anybody handling an open emergency, and for the last active
administrator. Details: `backend/src/modules/admin-service/README.md`.

This one is restricted by role rather than by care relationship, because it has no
scope of its own: it reports across everybody. A caregiver is refused.

## Live updates

Socket.IO namespace `/realtime`, message `emergency.updated`. The access token goes in
the handshake, `auth: { token }`; without a valid one, or for a deactivated account, the
server sends `unauthorized` and disconnects. The token is checked once, at the handshake,
so a client whose socket was refused after a reconnect refreshes its tokens the usual way
and opens a new socket.

Who receives a change:

- the elder, and everyone in their chain, through the room `elder:{id}`;
- administrators, through `administrators`;
- anyone else who was asked about this emergency (an emergency responder matched by
  area, for instance), through their own `user:{id}` room.

The message is a snapshot: `eventId`, `elderlyId`, `state`, `severity`, `currentTier`,
`acknowledgedBy`, `triggeredAt`, `deadlineAt`. It never carries where the elder is.
Location is disclosed through the REST endpoints, which apply the consent rules for the
person asking, so a client treats the message as a signal to re-read, not as the data
to show. See [ARCHITECTURE.md](../backend/docs/ARCHITECTURE.md).
