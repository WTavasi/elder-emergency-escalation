# Roadmap: an escalation system that understands what is happening

MzaziCare decides who should help, how urgently, in what order and through which service,
adapts to the people in it, and can explain every decision. Each phase below sharpens one
of the five decisions an emergency passes through: detect, assess, route, time and
communicate.

## Rules for every phase

- Nothing ever delays an alert. What the elder adds, by tapping or speaking, comes after it
  has gone.
- Rules set the limits and learning adjusts within them. Severity only rises during an
  emergency. Anything learned stays inside bounds and falls back to defaults when there is
  too little data.
- Every automatic decision can say why, in the app, the console and the emergency's record.
- Each feature ships with database changes older apps survive, a setting to turn it off,
  tests, console support and documentation. New data gets its own consent, retention and
  privacy notice line.

## Phases

| Phase | What | Decision | State |
| --- | --- | --- | --- |
| 1 | Say what is happening; send the right service | assess, route | built |
| 2 | Road travel times everywhere; an in-app map | route | built |
| 3 | Who to go to first, when several alerts are open; stations nearest first | route | built |
| 4 | Adaptive escalation and severity that learns, measured by a simulator | time, assess | skipped for now |
| M | Medical details for those asked to help | assess | built |
| 5 | Speak to report: voice, transcript, translation, "Hey Siri" | assess, communicate | built |
| 6 | Check-ins at intervals, agreed by everyone, with each elder's rhythm | detect | built |
| 7 | Understanding free-text replies in English, Swahili and Sheng | communicate | |

**1. Say what is happening.** The elder's waiting screen and HELP texts take a type; each
type has a severity floor and a service (ambulance, fire, police), asked at once for chest
pain or breathing, fire and danger, and at the responder step for a fall or feeling
unwell. Closing confirms what it really was. See decisions.md.

**2. Road travel times and a map.** OSRM's road distances for choosing volunteers and
road times for every time shown, with the straight line only as a labelled fallback. A
self-hosted OSRM with Kenya's map (`infra/osrm`). An in-app map (OpenStreetMap tiles)
showing the elder, everybody on their way and the road each is taking; the volunteer
going shares their way too. Spoken directions hand off to Google or Apple Maps. Ranking
emergency responders by road waits for each unit's base address. See decisions.md.

**3. Who to go to first.** For a caregiver or service with several open alerts, a ranked
list and map: first what nobody is handling, then by urgency and type, then where this
person would cut the time until help arrives most compared with whoever is already going.
Each row says why. Uses the person's location only when they allow it, and never keeps it.
Responder units are stations with an address, asked one at a time, nearest by road first,
the next after a decline or three minutes. See decisions.md.

**M. Medical details.** A medical ID for each elder, kept with its own consent: ticks for
what changes what a helper does (blood thinners, insulin, home oxygen, hard of hearing),
medicines, allergies, their doctor. Caregivers see and edit them; family and responders
see them only on an open alert they were asked about, read against what is happening,
with the service to ask when the history makes it more serious. Every look is recorded
and the elder sees who. See decisions.md.

**4. Adaptive escalation.** Skipped for now, to come back to. A simulator first, replaying thousands of made-up emergencies
against the real rules. Then: each responder's reliability by time of day, waits sized to
the person within each band's limits, the next group asked in parallel when the first is
unlikely to answer, text first for people who do not open push at night, and severity
weights calibrated from outcomes, approved by an administrator. An elder's history can
raise severity, never lower it.

**5. Speak to report.** Built. "Hey Siri, MzaziCare help fire" raises the alert with the
type said, for every type; on Android a home-screen widget, a quick-settings tile,
launcher shortcuts and the Assistant. After the press, the elder can speak for up to a
minute; our own Whisper server writes it down as said and in English, and the English,
Swahili and Sheng word lists pick the type, which is reported as a tap would be, so the
service follows after the usual short wait. Its own consent, the recording never kept,
the words kept 30 days. See decisions.md.

**6. Check-ins.** Built. Every half hour to six hours within a window as well as chosen
times; the elder agrees and the circle sees when; each elder's rhythm, with an earlier
reminder when an answer is unusually late for them and a weekly note to caregivers when
answers drift later or more are missed. See decisions.md.

**7. Replies.** Free text in English, Swahili and Sheng read for its meaning and a time
("nakuja dakika kumi"); unsure means asking back.
