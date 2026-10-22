# Decisions

Choices that are not obvious from the code, with the reasoning, so they can be defended
or reversed on purpose rather than drifted away from by accident.

## The severity policy is a weighted rule, not machine learning

Five factors with weights held in the database, summing to 100, banded at 35 and 60.

An escalation decision has to be explainable after the fact, to a family member and
potentially to a regulator. A model that scores an emergency at 0.82 cannot answer "why
did it call the ambulance". This can: the factor values and their contributions are
stored on the event, and the dashboard renders them as a table that adds up to the
score. The weights are configuration, so the policy can be tuned without a deployment.

Severity is scored twice. At the press, whether the elder will cancel cannot be known,
so that factor scores nothing and tier one goes out at once on what is known. When the
cancel window closes without a cancel, the emergency is scored again with it counted,
because an elder who raised an alert and then could not withdraw it is the clearest
sign in the policy that they may not be able to reach their phone. A higher band from
that review applies to the rest of the chain straight away: the tier already asked
keeps its place but gets the shorter window, counted from when it was asked; it is
texted as well if the new band sends SMS alongside push; and a tier the new band sends
in parallel goes out now. Nothing restarts, and nothing changes once somebody owns the
emergency. The review is a Redis timer like every other window, with the escalation
sweep as its safety net and `severity_reviewed_at` making sure it happens once.

## Caregiver cover was dropped as a severity factor

There were six factors at first. The sixth scored an alert higher when no caregiver had
declared cover hours covering that moment. Nothing in the product lets a caregiver
declare those hours, so for every elder registered through the app the factor scored in
full: a flat 10 points that measured nothing, enough to lift every unconfirmed daytime
alert from an independent elder out of the standard band.

It was dropped rather than built because the chain already handles an unavailable
caregiver: if they do not answer, the alert escalates. Declared hours are not presence
either, so the factor partly counted the same thing twice. Its weight went to time of
day (15 to 20) and away from home (10 to 15). The three cover columns on
`care_assignments` are kept, unread, so the factor can return with a screen for
declaring cover and without a migration. The seed switches the old row off rather than
deleting it, so the factors stored on past events still name a row that exists.

## An escalated alert can still be cancelled inside the window

The cancel window is ten seconds from the press. An alert whose first tier is empty, for
example because the caregiver was deactivated or the family member never signed up,
escalates at once, inside that window. Cancelling used to be allowed only before
escalation, so an elder who pressed by mistake lost the right to withdraw it because
the first person in their chain was missing, and was told somebody was already
responding when nobody was.

What ends the right to cancel is now ownership rather than state: an alert can be
cancelled inside the window from triggered, notified or escalated, as long as nobody
has taken it on. Everybody who was told about it is told it was withdrawn, as before.

## Escalation timing is event-driven, not polled

An acknowledgement window is a Redis key with a TTL, and expiry drives promotion. A
polling loop would trade accuracy against database load, and the accuracy is the
product.

The cost of that choice is that Redis publishes an expiry once and never again, so a
restart at the wrong moment would lose an escalation forever. That is why every dispatch
also writes a durable `current_tier_deadline_at` and the listener reconciles against it
on boot. See [ARCHITECTURE.md](../backend/docs/ARCHITECTURE.md).

## Provider failure has two kinds, and the difference is load-bearing

A permanent failure returns `delivered: false` and the caller moves straight to SMS. A
transient failure throws and the job retries. Getting this backwards either burns three
retries on a dead device token while somebody waits, or gives up on a working one.

## Passwords use scrypt from Node's own crypto module

Not bcrypt or argon2. Both are native modules, and a native dependency is one more thing
that has to compile on every machine and in CI. scrypt is in the standard library, is
memory-hard, and its cost parameters are stored alongside each hash so raising them
invalidates nothing.

## Refresh tokens are stored as a fingerprint, and rotate

The database holds a SHA-256 of the current refresh token, never the token. A stolen
database yields no usable sessions. Presenting a token that verifies but no longer
matches the stored fingerprint means the token was replayed, so every session for that
user is revoked.

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

## Declining escalates immediately, but never closes an emergency

A tier's timeout bounds how long an unanswered emergency waits. It was never meant to
make somebody who already knows they cannot attend sit out the rest of it. A caregiver
who is two hours away can say so, and the emergency moves on at once.

Three rules stop it becoming a way to make an emergency go away. Only the people the
current tier actually asked may decline, so being asked is what confers the right and a
contact further down the chain cannot decline on tier one's behalf. Nobody may decline
once a person has taken ownership, or a decline could undo an acknowledgement. And a
decline never closes anything: it removes one person from consideration and the chain
continues to the next tier.

Where a tier asked more than one person, which the critical band does, the emergency
waits until every one of them has declined. Escalating on the first would cut short
somebody in the middle of accepting.

The decline is recorded as a timestamp on the notification rather than as a status
value. Status records what happened to the message; this records what the person said
about it. Overwriting a delivery outcome with a response would corrupt the per-channel
reliability figures, which count a delivered message as delivered whatever the answer
turned out to be.

The elder is not told that somebody declined. They asked for help and help is still
coming; naming who could not attend would be distressing and would not change anything
they can act on.

## Ownership is claimed by a conditional write

Two responders answering in the same instant could both read `acknowledgedBy` as null
and both be told the emergency was theirs. Ownership is taken by an update whose WHERE
includes `acknowledgedBy: null`, which the database applies atomically with the SET, so
exactly one can match. Zero affected rows means somebody else got there first, which is
a conflict rather than an error.

## Two environment files

`backend/.env` is read by the API and the Prisma CLI. The repository root `.env` is
read by Docker Compose alone and holds only `POSTGRES_PORT` and `REDIS_PORT`.

They were briefly the same file, which is how the published database port and
`DATABASE_URL` came to disagree without anything reporting it. One secret has one home.

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

## Waiting on a provider is bounded

Node's `fetch` has no default timeout. A connection that opened and then stalled would
hold a queued notification until its lock expired minutes later, which in an emergency
means nothing is sent and nothing is reported.

Both providers now have a deadline. A timeout throws, which the processor reads as
transient and retries, and that is the right reading: a gateway that did not answer in
time may answer the next attempt. The push timeout bounds the wait rather than
cancelling the request, because Firebase's client offers no way to cancel, so a retry
after a timeout can produce a duplicate. For an emergency alert that is the right
trade: a duplicate is an annoyance, a job blocked on a dead socket is an alert nobody
receives.

## Rate limiting is counted in Redis, and is opt-in per route

An in-memory limiter is only a limit while there is one instance of the API. The moment
the platform runs two, an attacker gets double the attempts and the limit quietly stops
being one. The Redis already running for escalation timers is the natural home.

Applied per route rather than globally, because the panic button is the one endpoint
where refusing a request could cost somebody their emergency. Sign-in is limited where
brute force is the threat; raising an alert is limited far above anything a frightened
person pressing repeatedly would reach, and only to stop a compromised account filling
the database.

If Redis is unreachable the request is allowed. The limit is a mitigation, not the
access control, and refusing every sign-in because Redis is down would turn a degraded
system into an unusable one.

## Colour is defined once

`frontend/design-tokens/tokens.json` is the only place a colour exists. Every consumer reads a
generated file, and the generator recomputes 26 declared WCAG pairs and exits non-zero
if one regresses, so an inaccessible palette fails CI rather than shipping.

A hard-coded hex anywhere in an app is the one value that gate cannot check, which is
why there are none.

## The socket carries changes, not truth

Every screen loads over HTTP first and treats a socket message as a reason to update
what it already has. A dropped connection therefore degrades the dashboard to a
slightly stale one rather than an empty one, and the connection state is shown, because
an operator has to be able to tell "nothing is happening" apart from "I am no longer
being told what is happening".

Publishing is fire and forget. An escalation that failed because a socket was
unavailable would be a real emergency lost to a cosmetic feature.

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

## Hands-free activation is future work, and the obstacle is not recognition

A voice trigger, where calling out in a local language raises an alert, was assessed and
deferred. The finding is worth recording because it is counterintuitive.

Recognising one fixed word in any language is tractable. A keyword spotter trains on
recordings of the word, not on a language model, so an unsupported language is not the
barrier; custom wake words are routinely trained for languages no product ships.

The barrier is always-on listening. iOS gives a third-party app no sanctioned way to hold
the microphone open in the background, and Android can do it only with a foreground
service, a permanent notification and a battery exemption, which OEM power management will
still defeat. So the version people imagine, a phone in a drawer that hears someone call
out, is not deliverable on iOS at all.

If it is revisited, the two routes worth taking are an assistant integration, which
borrows the always-on wake word the platform already runs and costs about a day, and an
on-device keyword spotter evaluated properly, where the contribution is the measurement
rather than the feature: false accepts per hour matter more than accuracy for an emergency
system, because an alert nobody meant to raise erodes trust faster than a missed one does.

## Escalation has two mechanisms, and the second one exists for deployment

Timers are Redis keys and expiry events promote them. That is the design and it is what
makes the system event-driven rather than polled. It has one dependency that cannot be
engineered away: Redis has to be publishing keyspace notifications, which needs
`notify-keyspace-events Ex`. Compose sets it locally and the API sets it at boot if it is
missing, but a managed Redis may refuse CONFIG SET, and some disable the feature outright.

The failure that produces is the worst shape available. The system accepts emergencies,
dispatches tier one, records deadlines, and never escalates any of them. Nothing errors.
It would look healthy right up until somebody checked whether tier two was ever reached.

So the durable deadline that already existed for boot recovery is reconciled on an
interval as well. The listener promotes within a second when events arrive; the sweep
promotes within one interval whatever the provider does. Two mechanisms, different
guarantees, and no shared point of failure beyond the database.

Three things about it were deliberate. It runs the same code as boot recovery rather than
its own copy, because a second answer to "which deadlines have passed" is a second thing
to keep correct. It is silent on a quiet pass and warns when it promotes anything, since
promoting something means the listener missed an expiry and that is the only interesting
outcome. And it is switched off in the integration suite, because a safety net that hides
the failure it is catching would let the suite pass whether the event-driven path worked
or not.

The cost is a query every fifteen seconds against open emergencies, which is indexed and
touches nothing else. Calling the system event-driven is still accurate: nothing polls to
decide when to escalate, and the sweep is a reconciliation against a recorded deadline
rather than the mechanism by which escalation happens.

## The fonts are bundled, and one of them was chosen for low vision

Before this the token file named IBM Plex Sans and Archivo and no font file existed in the
repository. Both surfaces asked for faces that were never loaded and fell back to the
platform default, so the app rendered in San Francisco on iOS and Roboto on Android. The
design language described type that the product never showed.

Three faces now ship with the build:

**Atkinson Hyperlegible for the elder path.** Drawn by the Braille Institute specifically
for low vision, with letterforms deliberately differentiated so that b and d, 1 and l and
I, and O and 0 cannot be mistaken for one another. For an interface an older person reads
under stress, that property is worth more than any amount of visual character, and it is a
choice that can be justified from the literature rather than from taste. Weight 700
throughout, which is a reading decision and therefore a token rather than a per-widget
choice.

**Source Sans 3 for everybody else**, as one variable file covering 200 to 900. Smaller
than three static weights would be, and it means headings are separated from body text by
weight rather than by a fourth family.

**IBM Plex Mono for figures**, where digits have to line up.

Bundled and self-hosted rather than fetched. The console displays an elder's name and
address, so it makes no third-party request at all, and the API's content security policy
would refuse one. The cost is about a megabyte in the app, which for an emergency
application is the right trade: it means the elder screen's legibility is a property of a
decision rather than of whatever the phone happens to have installed.

Two implementation notes that were not obvious. A variable font carries weight as an axis
rather than as separate files, so the theme sets `fontVariations` as well as `fontWeight`;
setting only the latter leaves the axis at its default and every weight renders the same.
And the licence text is bundled as an asset and registered with Flutter's licence page,
because bundling a font is distributing it and the Open Font Licence requires the licence
to travel with it.

## Sign-up proves the phone number with a code

Anybody could otherwise create an account with somebody else's number. That person could
then never sign up themselves, and could be put into an elder's chain they never agreed
to. So sign-up, and a caregiver registering an elder, both need a six-digit code sent by
SMS to the number being registered.

The code request answers the same whether or not the number already has an account, so
it cannot be used to discover who is registered. A registered number is sent a message
saying somebody tried, which tells the owner without telling the person asking. Codes
are kept in Redis as a salted hash, live ten minutes, allow five wrong guesses and work
once; one number gets at most five codes an hour, which keeps the SMS bill out of an
attacker's hands. Before this, registering a taken number answered "an account already
exists", which was a way to test whether somebody was registered; that answer is now only
reachable by somebody who holds the phone.

## A caregiver adds family by phone number, and the place waits for them

A relative does not have to sign up before the caregiver can add them. If the number has
no account, its place in the chain is held in `chain_invitations` and taken, in the same
transaction, when that number signs up. Either way the person is sent an SMS saying who
added them and for whom, because finding out you are somebody's emergency contact during
the emergency is the wrong moment.

Each rank in a chain still holds one person, which the database has enforced from the
start. Allowing several family members at one rank is a small change, since dispatch
already notifies everyone at a rank, but it changes what "the family contact" means in
the documentation and the ERD, so it is left as a decision to make rather than a side
effect of sign-up.

## An elder's home is found by address search, on the server

The elder's home needs coordinates, because alerts are placed there and responders are
given directions to it. Reading the caregiver's phone location while they stood at the
home would have been simplest, but it would have broken the rule that the app never
reads a device's location. So the caregiver searches for the address and picks from the
matches.

The search runs on the API against OpenStreetMap's Nominatim, not in the app, so the only
party that learns an elder's address is this system, and so the public service's usage
policy (https://operations.osmfoundation.org/policies/nominatim/) is kept in one place:
one request a second across all users, an identifying User-Agent with a contact, a day's
caching, searching on a button rather than as the person types, and the OpenStreetMap
attribution shown under the results. A deployment with real traffic should run its own
Nominatim or use a paid geocoder, which is one setting, `GEOCODER_URL`.

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

## An elder stays signed in, and signing out is one step away from the panic button

Every other account's refresh token lasts 30 days, and a person who has not opened the
app for a month signs in again. For an elder that rule fails silently: the phone still
shows the button, the button no longer reaches anybody, and the elder may not remember a
password that somebody else set up. So an elder's refresh token lasts ten years
(`JWT_REFRESH_TTL_ELDER`), and every other protection still applies: it rotates on each
use, a replayed token ends every session, and deactivation ends it at once.

For the same reason the sign-out control left the elder's home screen. It sits on the
elder's own page, behind the round button at the top, at the bottom of that page, and
asks first, saying that the phone cannot ask for help while signed out.

## The app is told about changes by socket and by push, and still polls

The socket gives the app the console's speed. Push reaches a phone whose app is closed,
and also arrives while it is open, so both feed the same hub and a screen does not care
which spoke first. Neither replaces polling: a socket that reconnects does not replay
what it missed, and a push can be delayed or dropped by the phone. The poll slows to
every 30 seconds while the socket is up, which keeps a phone through a development
tunnel well inside the free plan's request allowance, and returns to its old pace when
the socket is down.

The Firebase project is given to the app as build defines rather than as
`google-services.json` and `GoogleService-Info.plist`. Nothing needs adding to Gradle,
no configuration file can be committed by mistake, and a build without a project is the
same build with push switched off: it never asks for notification permission.

The server keeps one push address per account and moves an address to whoever
registered it last, so a phone passed from one person to another never shows the first
person's emergencies. Signing out clears it.

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


## An alert can be answered by replying to its text

A caregiver with the app answers in the app. The person this is for is the one without
it: a family member on a basic phone, somebody out of data, a responder whose push did
not arrive. For them the alert SMS was a dead end that said "please respond" and offered
no way to. Now it ends "Reply 1 if you can go, 2 if you cannot", and the reply does what
the two buttons do.

A reply goes through the same acknowledge and decline as the app, not a parallel path.
So the rules those enforce hold for a text without being written twice: only somebody who
was asked can answer, the first to accept owns the emergency (the same conditional write
settles a text and a tap arriving together), declining is limited to the tier being
asked, and nothing a reply does can close an emergency.

The sender is identified by their number alone. The gateway reports it, and the secret in
the callback address is what shows the request came from the gateway. That is weaker than
a signed-in session, and acceptable for what a reply can do: accept or decline an
emergency the number was itself sent. A number that belongs to nobody gets no answer, so
the address cannot be used to learn who is registered or to run up a bill, and each phone
is limited to six replies in ten minutes.

Digits rather than words, because they are the same in English and Swahili and on every
keypad; the common words are read too, since people type them anyway. A reply is matched
to the newest alert still waiting on that person rather than carrying a reference,
because a reference is one more thing to get wrong on a small keypad, and two alerts
waiting on the same person at once is rare enough to accept the cost: they are told which
elder they answered for.

Replying is off unless `SMS_INBOUND_TOKEN` is set, and the alert only offers it when it
is, so nobody is told to reply to a number that ignores them. Two-way SMS needs a
shortcode. The sandbox gives one free with its simulator, which is what the demonstration
uses; a live shortcode is rented, which is a deployment cost rather than a design change.

## Talking to the elder goes through the app, and the elder's phone joins by itself

A phone call needs the person called to reach the phone and answer it. For an elder who
has fallen, or cannot get up, that is the step most likely to fail. So a responder can
start a call inside the app, and the elder's phone, already open on the emergency it
raised, joins on its own on the speaker. It says who is joining and buzzes for three
seconds first, with "Not now" to stop it, so the first thing the elder hears is not a
surprise; the responder's screen asks them to say who they are first. A large "End
call" is there for the whole call.

Opening a microphone without a press is the sharpest edge of this, so it is narrow. It
happens only during an emergency the elder raised, only after somebody in their circle
(the same participant rule as every button) asked to talk, only while the emergency is
open, and every join is audited with who and when. The token allows the microphone and
one room and nothing else. Nothing said is recorded, and the audio does not pass through
this server.

LiveKit carries the audio: an open-source WebRTC server, used here through LiveKit
Cloud's free plan, with a local development server as the offline option. Its access
token is a JWT signed with the project secret, so the API signs it with the JWT library
it already has rather than adding a dependency for one token.

The tone the plan described became a buzz and words on the screen. Flutter's system alert
sound only plays on desktop operating systems, and a recorded chime would need an audio
player whose audio session then has to be handed to the call. The buzz, the large text
and the responder speaking first do the same job.

The fallback is ringing with the phone's own dialler, which every alert already offers.
An Africa's Talking conference call, which would reach a phone that was locked or had
the app closed, does not work in their sandbox and needs a purchased voice number, so it
is future work rather than part of this build.

## A daily check-in is opt-in twice, and a missed one is an ordinary alert

The panic button only helps an elder who can press it. A check-in covers the case it
cannot: once or twice a day the elder is asked "are you all right?", and if nobody
answers, the care circle is told. Products that already do this for older people living
alone, such as daily call services and wellness check-in apps, do it the same way: a
fixed time, one easy answer, and a person called when the answer does not come.

It is off until somebody turns it on, and when anybody other than the elder does, nothing
is asked until the elder agrees on their own phone. A check-in is a form of watching, and
the people being watched are the ones who decide that. Changing the times asks again for
the same reason. Turning it off is never held up by anybody's agreement. At most three
times a day: past that it stops being a check-in and becomes supervision.

A missed check-in is not a new kind of emergency with its own machinery. It is an alert
raised through the same path as a press of the button, so the chain, the timers, the
texts, the replies, the console and the audit trail all apply without a second copy of
any of them. What differs is said rather than built: the alert carries
`trigger: MISSED_CHECK_IN`, its messages say "did not answer today's check-in" and ask for
a call first, and it is held at the standard band. Somebody who slept through a reminder
is the common case, and the critical band's "everybody at once" would teach the circle to
ignore these.

A late answer withdraws the alert only while nobody has taken it on. Once somebody is on
their way the answer is recorded on the alert and they still go, because "I am all right"
pressed late is exactly what a check-in cannot vouch for. A press of the help button can
never be withdrawn this way. A reply to the check-in text is read the same way, and only a
1 counts: anything else from an elder is answered with how to get help, never taken as a
call for it.

The clock is a one-minute interval reading the database, not a Redis key per check-in. A
check-in is a time of day, a minute late is nothing for this question, and everything the
clock acts on is in the database, so a restart loses nothing. Each step is a conditional
write (one check-in per elder per time, pending to missed once), so a second API instance
does nothing twice. Times are kept as minutes after midnight in the elder's time zone and
turned into instants each day, so the clocks changing elsewhere, or an elder travelling,
does not move nine in the morning.

## Community volunteers go beside the chain, and learn who and where only by going

Professional responders cover parts of a city, and a family can be an hour away. In many
neighbourhoods the quickest help is a neighbour with first aid. Systems that already do
this, such as GoodSAM in the UK and PulsePoint in the US, alert trained volunteers within
a few hundred metres, and Kenya's Community Health Promoters are an existing pool of
exactly that kind of person.

Four decisions shape it.

**Vetted before anything is sent.** Anybody can sign up as a volunteer in the app, which
keeps joining easy, but nothing reaches them until an administrator approves the
application in the console's vetting queue. The training is declared and checked off
the system, by seeing a card or making a call; the system stores no certificate and no
ID number, because it does not need them to make the decision and keeping them would be
a liability. An administrator can suspend a volunteer at any time.

**A home area and a switch, not a tracked phone.** A volunteer sets the place they help
from (usually home) and how far they will go, from half a kilometre to five, and turns
"available" on when they can help. They are matched by that area. Reading the phone's
position would be more precise, but phones stop reporting in the background, so in
practice it would only work with the app open, and it would build a location trail of
private citizens. An area and a switch work with the app closed, by push or SMS, and
store nothing about where anybody is.

**Asked only when it adds something, and only for an elder who agreed.** Volunteers are
asked with a critical alert, from its first tier, and when an alert reaches the responder
tier where no professional responder covers the place. Not for every alert: a volunteer
asked about everything learns to ignore it. The elder (or their caregiver, which the
elder then confirms) must have agreed to it, recorded as a consent of its own, because
it means a stranger is told their name and address. Withdrawing that consent stops it.

**Beside the chain, never instead of it.** The first volunteer to accept is told who and
where, the rest are stood down, and the elder and the circle are told who is coming.
Accepting does not take the emergency on, stop a timer or change the emergency's state.
A volunteer is a stranger to the family, and nothing a stranger presses should stop the
family from being asked. The disclosure is also the price of going, not of being asked:
before accepting, a volunteer is told how far and how urgent only, and once the emergency
ends, the name and address disappear from their screen.

Volunteers are not participants in the emergency. They cannot open the emergency's
record, take it on, close it, join its voice room or share their way there; their routes
are their own, and the emergency's are refused to them as to anybody outside it.
