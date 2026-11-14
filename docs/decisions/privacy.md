# Decisions: Privacy, consent and personal data

Consent, location, medical details, retention and the privacy notice.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## Retention is enforced, not just configured

The privacy notice and the console's privacy panel both tell people how long their
data is kept. For a while the windows existed as configuration and nothing acted on
them, which made a published promise the system could not keep.

A daily sweep now deletes closed emergencies past their window, which cascades to their
audit logs and notifications, then removes audit entries that outlived their own,
shorter window while their emergency is still retained. An open emergency is never
deleted whatever its age: one nobody ever closed is a failure worth keeping the
evidence of, and the window is measured from when an emergency finished rather than
when it was raised.

It is a plain daily timer rather than a cron library, because it runs once a day and
needs no schedule expression. `npm run retention:sweep -w @mzazicare/api` runs the same
code on demand, so the policy can be demonstrated rather than waited for.

## The server decides where an emergency is, and the app never reads the device

The obvious design was to read GPS when the panic control is pressed. It was rejected,
and what replaced it is better on three counts rather than merely cheaper.

The elder's location is their registered home, unless somebody in the care circle has
recorded a stay away from it. Raising an emergency sends no coordinates at all.

**Privacy.** An app that never asks for location permission has no location trail to
secure, to disclose in a privacy notice, or to explain to a research participant before
they consent. The question "what do you do with my whereabouts" has the strongest
possible answer, which is that the system never learns them. Continuous tracking of an
elderly person would have needed a much larger justification for a much smaller gain.

**Integrity.** Location is an input to the severity score, and the severity score decides
how urgently the system treats a person. A client that could name its own coordinates
could name coordinates that raise its own priority. Resolving location server-side from a
record only a caregiver can change puts that input out of the caller's reach.

**Reliability.** A GPS fix can be slow, denied, or unavailable indoors, which is where
falls happen. Every one of those is a reason a panic request could have failed or stalled
at the worst possible moment. There is now nothing in the raise path that can fail before
the request goes out, and the client-side precondition that used to be able to disable the
panic control for an account with no registered home is gone with it.

This applies to the elder. From Phase 1 a responder's phone can share where it is, but
only when that person turns it on, only after they took an emergency on, and only until
they arrive: see "Somebody on the way shares it by choice, and only the arrival is kept".

The cost is precision. An alert raised while the person is out and about, with no stay
recorded, is located at their home. That is an accepted limitation rather than an
oversight: the away-from-home factor still works, because a recorded stay moves the alert
location while the registered home stays put for it to measure against, and a stay is
something the care circle already knows about. The version of this with a device location
is written up as future work, not as an unfinished feature.

## Consent is confirmed by the elder, can be withdrawn, and never stands in front of help

A caregiver usually registers an elder and consents on their behalf. The Data Protection
Act allows that only as far as the person cannot consent themselves, so the elder is
asked to confirm at sign-in. The question is a line above the panic button, with "Not
now" beside it, never a screen in front of it: an elder opening the app in an emergency
must be one press from help, and the consent given on their behalf still stands until
they confirm or withdraw it.

The elder, or a caregiver in their chain for an elder who cannot use the app, can
withdraw any consent. Withdrawal is honoured everywhere data leaves the server, outside
an emergency: the number and whereabouts disappear from the care circle's screens,
from closed alerts and from history, and the screens say why. During an open emergency
the people responding still see them. That is processing to protect the elder's vital
interests, a ground the Act provides apart from consent, and the privacy notice has to
say so. Withholding an address from the person driving to a fall would be the opposite
of what the elder wanted protection for.

Withdrawing consent to processing itself ends the service: everything is withdrawn with
it, the account is deactivated and its sessions end, and the history is kept, since it
is named in other people's records. It needs an explicit confirmation in the app and in
the API, and is refused while an emergency is open. An administrator can reactivate the
account; giving consent again after a withdrawal is a separate decision, not yet built.

## Somebody on the way shares it by choice, and only the arrival is kept

"Help is coming" is the sentence an elder most needs, and it is twice as useful with a
time attached. So a person who took an emergency on can share their way there, the way a
ride-hailing app shows a driver coming. It is off until they turn it on, it only runs for
an emergency they own, and it stops when they arrive or the emergency closes.

The positions are kept in Redis for three minutes and never written to the database. What
the database keeps is the time they arrived, as `arrivedAt` and an `ARRIVED` audit entry
with the seconds from the alert and from the acknowledgement. That is the number the
evaluation needs (how long until somebody was with the elder), and it carries no route.

The elder sees how long and how far, not a map: a moving dot is one more thing to read at
a bad moment, and "Mary is about 9 minutes away" is the whole message. The care circle
and the console also see where, so a second person can decide not to set off.

Arrival is a state, `ON_SCENE`, rather than only a timestamp, because the console's board
and every screen's state label need to say "with the elder" at a glance. The timestamp is
kept as well, because an owner on scene can still call in a responder, and "help arrived"
must stay true when the state moves on.

The time comes from OSRM, an open-source router over OpenStreetMap data, when it is
switched on, and from a straight-line estimate (a 1.4 detour factor at 25 km/h) otherwise
or whenever the router is slow or busy. The public OSRM server allows one request a
second, so the server asks it at most every 30 seconds per emergency and scales the last
route in between. Neither knows about Nairobi traffic, so the time is said as "about".

On the phone, location access is asked for when the person turns the setting on, not
when they take an emergency on, because the second moment is the worst one to put a
system dialog in front of somebody. Only "while using the app" access is asked for. The
sharing still carries on behind a maps app, which is where somebody following directions
will be, through a foreground service on Android and the location background mode on
iOS. Both are visible: Android shows a notification and iOS the blue location indicator
for as long as it runs, so a person can always see that they are being shared. The
elder's phone never asks for location at all; nothing in the elder's side of the app
reads it.

## Medical details, under the Data Protection Act

On 7 November 2026 each elder gained a medical ID: what a helper should know in an
emergency, shown on the alerts they are asked about.

**Why it is shaped this way.** Health data is sensitive personal data under the Kenya Data
Protection Act 2019 (section 2), and Part V (sections 44 to 46) narrows when it may be
processed, with section 46 written for data about health. These choices follow from that
and from the general principles (section 25), consent (sections 30 and 32), protection by
design (section 41) and retention (section 39). Read the Act itself and the ODPC's
guidance note on processing health data before a real deployment: this project could
only read summaries of sections 45 and 46 when it was built.

- **Its own consent.** `MEDICAL_PROFILE` is never part of registration. Nothing is kept
  until somebody agrees, and a caregiver's agreement is for keeping the details: family
  and responders see them only once the elder has agreed for themselves, or a caregiver
  has said the elder cannot and that they act for them (below). The elder is texted and
  asked at their next sign-in, as for every consent given for them.
- **Who sees them.** Caregivers, anytime, since they look after the elder and keep the
  details current. Family and emergency responders, only while an alert is open and only
  once they were sent it. Volunteers never; administrators never, though the console shows
  who opened them during an alert, for oversight.
- **Only what an emergency needs** (minimisation). Sixteen ticks for what changes what a
  helper does in the next ten minutes, a few short lines for the rest, and nothing a
  doctor's record holds beyond that.
- **Every look recorded, and the elder sees who.** By person, time and alert. Kept after
  the details are deleted, as the account of who saw them, and removed with the audit
  log after `RETENTION_AUDIT_LOG_DAYS`. Every change is recorded by part (never by what it
  said), and the elder is texted when somebody else made it.
- **Sealed at rest.** AES-256-GCM with `MEDICAL_DATA_KEY`, a key the database never
  holds, so a copy of the database or a backup carries no readable health data. Without
  the key the feature is off and says so.
- **Never in a text or a push.** Both pass through services outside Kenya (section 48 and
  onward govern transfers abroad). Notifications say only that details changed; the
  details stay on this server and in the app.
- **Withdrawal deletes.** Withdrawing the consent, or the service itself, deletes the
  details and the record of changes in the same transaction. A closed account's details
  go at the next retention sweep.

**Read against the emergency.** Each tick carries what it means for each type: blood
thinners in a fall ("a fall can bleed inside"), home oxygen in a fire, insulin when
unwell. When a tick makes an emergency more serious than it looks, the alert says so in
plain words and offers the service to ask, an ambulance for a fall, in the amber of
calling somebody in. It never changes severity or asks a service by itself: a helper
decides. The wording is a prompt to get a professional sooner, not a diagnosis.

**Open questions for the project owner.** Section 46 limits health data to processing by
or under the responsibility of a health care provider, or by somebody bound to
confidentiality. Whether MzaziCare, its staff and the responders it asks meet that, for
example through confidentiality terms and the ODPC's registration of data controllers
handling health data, needs advice from a lawyer before a real deployment. A data
protection impact assessment (section 31) should be written for it, and the privacy
notice needs a line about it, which is the owner's to write.

**Answered by the owner, 6 November 2026.** MzaziCare is the handler of this data and
the logging above is what it needs. The privacy notice now has the line. A guardian's
consent counts for an elder who cannot give their own (section 32 lets a person with
parental authority or a guardian consent for one who cannot), declared by a caregiver:

- **The caregiver declares it.** On the elder's medical page a caregiver confirms that
  the elder cannot decide this for themselves, for example because of dementia or a
  serious illness, and that they act for them. The sheet says so in those words.
- **Recorded, not overwritten.** A `MEDICAL_PROFILE` consent row granted by that
  caregiver with the relationship `guardian`, so who said it and when is kept beside the
  consent to keep the details. Ending it sets its withdrawal time.
- **Everybody hears of it.** The elder and the other caregivers are texted, with no
  health data in the text. The elder and their caregivers see on the page who said it
  and since when; the console shows it on an alert beside who looked.
- **Withdrawable by any of them.** The elder (who may be able to decide after all) or any
  caregiver. The details stay with the caregivers; they stop being shown to anybody else.
- **Never over the elder's own word.** It cannot be declared once the elder agreed for
  themselves, and the elder agreeing later makes it unneeded.

## The privacy notice, November 2026

Version `2026-11-1` adds what the phases since October brought, as the owner approved on
6 November 2026: the kind of emergency, when somebody says it; text replies read for
whether somebody is coming and how soon; medical details, who sees them, that they are
sealed and never in a text or a notification, and that withdrawing deletes them; a
caregiver deciding about them for an elder who cannot; what an elder says after pressing
help, written down on MzaziCare's own server and kept for `SPEECH_RETENTION_DAYS` (now
given in `/legal`, so the notice states the server's figure); live location used to list
open emergencies nearest first, never kept; and the weekly note on check-in answers.
"No health records are held" became "no health records are fetched from anywhere", which
stays true. Consents keep the version they were given under; the new version applies to
those given from now.
