# Product

<!-- impeccable:product-schema 1 -->

The durable product record for design work, in the format of the impeccable design
guidance (https://github.com/pbakaus/impeccable). What the product is, for whom, and
what must stay true. The visual system is in [DESIGN.md](DESIGN.md); the reasoning
behind individual decisions is in [docs/decisions.md](docs/decisions.md).

## Platform

adaptive

The Flutter app ships to Android and iPhone and follows each where it matters: iOS's
own alerts and switches on iPhone, Material everywhere else. The administrator console
is a web app (`frontend/dashboard`) and follows web conventions.

## Users

- **Elders cared for at home**, in Kenya. Often registered by a caregiver rather than
  signing up themselves, may have low vision or unsteady hands, may be on a basic phone
  or a smartphone with no data bundle, and may be reading the screen in a panic, on the
  floor after a fall, or not reading it at all. Their one job: ask for help, and know
  that it is coming.
- **Caregivers**, first in the chain: answer an alert, go, or say they cannot.
- **Family members**, asked next, often on a basic phone and answering by SMS.
- **Emergency responders**, asked when nobody in the family answers in time.
- **Community volunteers**: vetted neighbours asked alongside the family when an alert
  is critical or the chain has nobody left to ask, only if the elder agreed.
- **Administrators**, at a desk in the web console: watch every open emergency, read
  the record of any one, run reports, manage accounts. They see emergencies but never
  act on them.

## Product Purpose

The alerting and escalation part of the MzaziCare platform for home-based elderly care.
One press, or one text, raises an alert; the system scores how serious it is likely to
be and works down the people who look after the elder in order, moving on by itself
when nobody answers in time, until somebody takes it on and arrives.

Success is measured in time: from the alert to somebody accepting it, and to somebody
being with the elder. The evaluation reads these from the audit log.

Final year project, Strathmore University. Not a medical device: it detects nothing on
its own and does not replace emergency services.

## Positioning

**Every escalation decision can be explained afterwards.** Severity is a weighted score
from five factors held as data, and the factor values are stored with each emergency, so
"why did it call the responder?" has an answer a family member or a regulator can read,
row by row. Every state change is in the audit log.

**It reaches people without a smartphone or data.** Alerts fall back to SMS; a person can
accept or decline by replying 1 or 2, in English or Swahili; an elder with no data can
text HELP and raise the same alert the button does. When the app cannot connect, it
offers texting and calling instead of an error.

## Operating Context

- An elder's phone may be on a table, in a pocket, or on the floor. The help screen is
  read at arm's length or not at all, so vibration and colour carry state as well as words.
- Caregivers and family are on the move, on phones, often with patchy data. SMS is a
  first-class channel, not a fallback afterthought.
- Kenya: Africa's Talking for SMS and shortcodes, OpenStreetMap for addresses and travel
  time, 999 as the emergency number, English and Swahili.
- Administrators use the console at a desk, looking across many records at once.

## Capabilities and Constraints

- One-tap alert with ten seconds to withdraw; the first tier is told at the press.
- Ranked chain: caregiver, family, emergency responder; Redis timers with a sweep as a
  safety net; first acceptance owns the emergency; declining moves it on at once.
- Push with SMS fallback; reply 1/2 by SMS; HELP by SMS from an elder.
- Offline fallback on the elder's phone: text MzaziCare, text the family, call a carer
  or 999, with the alert retried in the background.
- Daily check-ins, calls through the app that answer on the speaker, "on the way" sharing
  with a time, community volunteers, consent records, retention enforced by a daily sweep.
- **Constraints:** the elder's phone never reads its location; consent follows the Kenya
  Data Protection Act 2019 (who consented, for whom, when, and withdrawal); no health
  fields; no third-party analytics; the console makes no third-party requests once signed
  in; every colour comes from `frontend/design-tokens` and passes a contrast gate in CI.
- **Must not claim:** a guaranteed response time, 24/7 monitoring, medical or fall
  detection, or that it replaces emergency services.

## Brand Commitments

- The name is **MzaziCare**.
- Voice: plain words a person would say, addressed to "you"; controls name the action
  ("I am all right, stop this", not "Cancel"); progress said in words, never a bare
  spinner; the elder is never told who declined to come.
- Red is reserved for a person being needed. See DESIGN.md.

## Evidence on Hand

- Seeded demonstration data, a scripted end-to-end demonstration
  (`npm run demo -w @mzazicare/api`), unit, widget and integration test suites.
- There are no real users, testimonials, field-trial results or response-time figures
  yet. Future work must not invent them; demonstration figures are labelled as such.

## Product Principles

1. **Nothing optional stands between the elder and help.** Consent questions, check-ins
   and settings sit beside the help button, never in front of it.
2. **Every decision can be explained after the fact.** If a rule cannot be shown as data
   and read back, it does not decide anything.
3. **Reach people where they are.** A text works where an app does not; design for the
   basic phone and the empty data bundle, not only the smartphone.
4. **Protect by not collecting.** What the system never learns cannot leak; the elder's
   phone is never asked where it is.
5. **Be honest about limits.** Say "about" for travel times, say when something has not
   been sent, and never promise a response the system cannot guarantee.

## Accessibility & Inclusion

- Elder mode (on for elders, and anybody can switch it): body text 20pt or larger,
  touch targets 72pt or larger, AAA contrast on body text and the help button, usable at
  200% system text size, Reduce Motion honoured.
- Everyone else: 14pt body floor (17pt by default, Apple's size), 48pt touch targets, AA
  contrast everywhere.
- The phone's own face, at sizes that follow the phone's text-size setting.
- Colour never carries state alone: every state also has a glyph and a word.
- Both floors are asserted in tests against the token constants, and contrast is gated
  in CI.
