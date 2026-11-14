# Decisions: Severity and escalation

How an alert is scored, who is asked, in what order, and when it moves on.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

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
on boot. See [ARCHITECTURE.md](../architecture.md).

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

## Saying what is happening, and asking the right service

Until now an alert said that an older person needed help, and nothing about what kind. A
fire went to the family first, and the emergency responder step reached whichever
responder covered the place, whether it was a fire, a fall or a break-in. On 4 November
2026 the elder, or anybody helping, can say what is happening, and the system acts on it.

**After the alert, never before.** The elder's waiting screen offers "Say what's
happening": one large button opening a sheet of five rows (I fell, chest pain or
breathing, I feel unwell, fire, I'm not safe). Not five buttons on the screen itself,
which at the elder's size pushed it past the height of a small phone. A HELP text can say
it too ("HELP MOTO"). Nothing waits for it: most alerts will never have a type.

**The rule decides, as data.** Each type has a row in `emergency_type_rules`: a severity
floor, a service, and whether that service is asked at once. Chest pain or breathing, fire
and not being safe ask theirs at once, beside the family, because minutes matter and the
family cannot put out a fire. A fall and feeling unwell ask the ambulance at the usual
responder step, because the family often handles those. A floor can only raise severity;
a fall reported on a critical alert leaves it critical. The project's owner chose this
split over asking every service at once or none until the end.

**Services, with fallbacks.** Responder accounts are now a service: ambulance, fire,
police, or general, which takes any call and is every responder made before. The
service a type needs is asked if any of its responders covers the place, else a general
responder, else whoever covers it, because reaching the wrong service beats reaching
nobody; with nobody at all, volunteers nearby.

**Health details stay off lock screens.** A service's push starts with the type, because
it decides what to send. A family member's lock screen shows fire and danger, which are not
health information, and keeps a fall or chest pain inside the app, where only they read it.

**What it really was.** Closing an emergency now asks what it was, starting from what the
elder said. Compared with the report, this says how often the elder's own account was right,
which the evaluation needs and which the voice report (phase 5) will need to be judged by.

**What this adds to the data.** The reported and confirmed types are kept with the
emergency and deleted with it. They can be health information, so the privacy notice
needs a line saying so; that change is the project owner's to approve. The plan for the
phases after this one is in `docs/roadmap.md`.

## Stations nearest first, and who to go to first

On 6 November 2026 responder units became stations, and the open alerts list became the
order to go to them.

**A station, not an area.** A responder account had only the area it covers, and a road
time from the middle of "Kileleshwa and Lavington" would look precise and mean nothing.
Each unit can now say where it is based: Kilimani Police Station on Lenana Road, the
Central Fire Station on Tom Mboya Street. The seed uses real Nairobi stations with their
real names and roads and made-up phone numbers, as the project owner asked. Their
coordinates are approximate, because no map service could be reached when they were
written; the console's address search corrects one in a few seconds.

**Nearest first, then the next.** Until now the responder step asked every unit covering
the place at once, which would send every police station in the city to one call. A
dispatcher sends the nearest, and the next if it cannot go. So one station is asked, the
nearest by road of the service the emergency needs; a decline passes it over at once,
and three minutes without an answer has the next one asked too, while the silent one can
still answer. The project owner chose this over asking the nearest two at once, or all of
them in order. The three minutes is `STATION_WAIT_SECONDS`, and like every timer here it
has a durable copy, so a restart cannot lose it.

**The family sees which station, and roughly how far.** "Kilimani Police Station. Asked,
no answer yet. About 6 minutes away by road, from the station." From the station, because
the unit may be out on another call; the owner chose to show it as an estimate rather than
not at all.

**Who to go to first.** For somebody with several open alerts, the server orders them: what
nobody has taken on, then their own, then what somebody else is handling; within each, by
severity, then the urgent kind, then time. Time is how near this person is for one nobody
has, and how much sooner they would get there than whoever is going for one somebody has,
when that is two minutes or more. Every alert says why; a list row adds only the reason it
cannot show by itself. A small map shows them all.

**Location only when allowed, never kept.** The times are measured from the phone only if
the person turned on "Share live location" and the phone already allows it; the app never
asks for permission to sort a list. The position goes in the body of one request, which no
log records, and is not stored. Otherwise a station's own address is used. This is a new
use of a person's location, beside sharing it on the way, so the privacy notice needs a
line saying so; that change is the project owner's to approve.

**The map follows the design rules.** The phase 2 map coloured people on their way with the
theme's primary colour, which is the emergency red, and a volunteer with a colour from
outside the tokens. Pins now say what they are in the state colours: red only for an elder
nobody has taken on, the "on the way" blue for anybody going, ink otherwise, each with its
name. The full-screen map's top bar has the back arrow and nothing else, and "show everyone"
is a round button on the map, where Maps keeps its controls.

**Revised the same day: the default responder, a short wait, and a choice.** Making every
responder a station replaced the two general response units in the seed, so every elder's
chain ended at a police station. They are back as the default emergency responder, asked
when the family has not answered and nobody has said what is happening; the stations are
asked when what is happening needs them. The project owner also asked for:

- **A short wait before a service is asked for a report.** About 25 seconds after the elder
  says chest pain, fire or not safe, not at the tap, so a mistaken tap can be changed first.
  What is reported when the wait ends decides.
- **A choice for the family.** "Ask for…" now asks which service: the one the emergency
  needs first, then the others. The nearest station of the one chosen is asked at once, and
  another can be asked later; none twice.
- **Everybody can see who can come.** The elder's page and their circle's page about them
  list the nearest responder, ambulance, police and fire service, and roughly how far each
  is by road.

**The Me pages, as Settings.** Both are now grouped rows: a personal header with the
person's initials, then sections of rows that open a page, switch something, choose from a
pull-down, or open in place. What is used now and then folds away (care circles, history,
the services nearby, the daily check-in); what matters most is out in the open: on the
elder's page, a row to call each person in their circle, first.

## The policy editor, who is asked first, and several phones per account

Built on 9 November 2026 to close what was left that does not need a deployment: the
rule and weight editor (issue #60, FR-15), reordering contacts, and the native code that
CI never compiled.

**An editor for the escalation policy, for administrators.** The rules each severity
escalates by (each tier's time limit, whether it is asked with the tier before, whether it
is texted at once), the weights behind a severity score, and the scores at which High and
Critical start. The rules and weights were already data the escalation and scoring read for
every alert; the band thresholds were environment variables and are now settings in
`policy_settings`, with the environment values still used until an administrator sets
them. Every change is checked against what keeps the system working, and refused with a
reason otherwise:

- a time limit from 15 seconds to an hour, so a slip cannot make a tier vanish or wait all
  day;
- the last tier has no limit, and every other tier has one, or an alert would stop
  climbing;
- tier 1 is never asked "with the tier before", because there is none;
- High starts below Critical, and Critical no higher than the weights can add up to, so
  the top band stays reachable; a weight change that would put it out of reach is refused;
- a factor this version cannot measure cannot be weighted, because it would change nothing.

Each accepted change is saved with a row in `policy_changes`: who, when, the values before
and after. The console shows that list. A change applies from the next alert (weights,
bands) or the next tier asked (rules); an alert already waiting keeps its deadline, because
moving a deadline under somebody who has just been asked would be unfair to them and hard
to explain afterwards.

**Who is asked first.** Contacts are asked by rank, everybody at a rank together, and the
rank was fixed by role: caregivers first, family next. A caregiver in the circle, or an
administrator, can now put each person at either rank, so a daughter next door can be asked
with the caregiver rather than after. The whole order is sent and saved at once, so a chain
is never half changed; it is refused while an emergency is open, because that emergency is
already working down the old order; somebody with an account must be asked first; and
emergency services stay last, as the rules say. Everybody moved, and the elder, is told by
text. Family members cannot reorder, as they cannot add or remove people.

**Several phones per account.** One refresh token and one push address per account meant
a second phone signing in signed the first out within the quarter hour, and only one phone
rang. Each signed-in phone now has its own session in `user_devices`, with its own refresh
token and push address. An alert goes to every phone the person is signed in on, and is
delivered if any of them takes it; an address the push service no longer knows is
forgotten. Signing out ends only that phone. A replayed refresh token, a new password or a
new number still ends every session. Sessions from before the change keep working and move
to a device of their own, push address included, at their next refresh, so nobody is
signed out by the upgrade.

**Native code compiled in CI.** A separate workflow builds the Android APK (Kotlin: the
widget, the quick settings tile, the shortcuts) and the iOS app without signing (Swift:
the App Intents and Siri phrases), whenever the app changes. Its own workflow, because a
macOS runner costs about ten times a Linux one. Its first runs on GitHub are what prove it:
neither platform can be built in the environment this was written in.

**Also:** coverage on each CI run's summary page (#83), the dependency audit with its
before, after and accepted risks (`docs/evidence/2026-11-09-dependency-audit`), and the
later endpoints in the Postman collection.
