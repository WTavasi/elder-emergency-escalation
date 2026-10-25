# Design language, enforceable constraints

Version 0.2. The narrative version with swatches and rationale is kept in the project
documentation. This file is the part that code has to obey.

## Governing rule

Red is a state, not a brand colour. `red-700` and `red-600` appear only on the panic
control, on an event in `TRIGGERED` or `ESCALATED` state, and on a destructive
confirmation. Never on navigation, headers, links, empty states, charts or brand bars.

Yellow means "you can still act on this". The caution yellow appears on the elder's
screen only, and only at two moments: the ten seconds in which a pressed alert can still
be stopped, and the phone having no connection. It is never decoration.

## Colour

Defined once in `frontend/design-tokens/tokens.json`. Consumed only through the generated
outputs. No hex literals in widgets or components.

Semantic hues are limited to four besides the emergency red: amber for waiting, blue
for owned, green for closed, and the caution yellow above. Blue is also the focus-ring
colour. Escalation tiers get a number and a role name, never a colour of their own.

The caution yellow (`caution`) is the same in light and dark mode, because its job is
to be seen, and the only ink on it is `onCaution`, the darkest one, at 12.7:1. The
countdown ring's empty track is `cautionTrack`. All three are in the contrast gate.

One decorative pair, `decorWash` and `decorRing`, a pale tint of the brand red and a
slightly deeper one, draws the rings behind the screens before sign-in, on the app and
the console alike. They carry no meaning and are in no contrast pair, which is only
acceptable because nothing that has to be read is ever placed on them: the forms sit on
cards. They are kept out of every screen after sign-in, where the red has to mean an
emergency and nothing else.

Two roles exist only to pass contrast where the brand colours cannot. `danger` is the
red for text and thin marks: the brand red in light mode, a lighter red in dark mode,
where the brand red is 2:1 against the background. Error text, the waiting dot and the
"waiting" state are all written in it. `control` is the outline of a field, at 3:1 or
better against the page in both modes, as WCAG 1.4.11 asks of a control's boundary; the
hairline colour it replaced was 1.3:1. Both are in the contrast gate.

## State appearance

| State | Console | App | Meaning |
| --- | --- | --- | --- |
| `TRIGGERED` | filled red pill | glyph and "Waiting" in red | created, nobody notified yet |
| `NOTIFIED` | amber pill | glyph and "Waiting" in red | dispatched, ack timer running |
| `ACKNOWLEDGED` | blue pill | glyph and "Being handled" in blue | someone owns it |
| `ESCALATED` | outlined red pill | glyph and "Escalated" in red | a tier timed out |
| `RESOLVED` | green pill | glyph and "Closed" in green | closed with an outcome |
| `CANCELLED` | neutral pill | glyph and "Withdrawn" in grey | withdrawn inside the grace window |

The console keeps its pills, which sit in table cells. The app writes the state inline,
a glyph and a word in the state's ink, because a capsule inside a row inside a card was
most of what made its lists look generated. To a caregiver, triggered and notified are
the same thing: nobody has answered yet. Colour never carries state alone: every state
also carries a glyph and a word.

## Layout, in the app

Swiss and utilitarian: the type and the spacing do the work boxes used to.

- **No cards.** Lists run edge to edge, one row per item, divided by hairlines. Sections
  start with a small-capitals label over a hairline (`SectionLabel`). Messages are an
  icon and the words beside it, not a filled box: an error mark in the text-safe red, an
  information mark in ink.
- **No side stripes.** A coloured border down the left or right edge of a row, a
  message or a banner is decoration, and it is ruled out above a 1-point hairline. State
  is said by a glyph and a word, and where it has to catch the eye down a list, by a dot
  at the start of the row. The one vertical line allowed is a hairline that is structure:
  the spine of the alert trail.
- **One big thing per screen.** Each screen opens with its title at headline size, tight
  and left-aligned (`PageTitle`, or the elder's name on a detail screen), so the eye lands
  in the same place every time.
- **Red means a person is needed.** An emergency nobody has answered gets a red dot at
  the start of its row in the list, as an unread message does, and the waiting count in
  red under the title. Nothing decorative is red after sign-in.
- **Figures in the monospaced face**: ages, ranks in a chain, phone numbers, the
  countdown. They line up down a column and do not jitter as they change.
- **The thumb decides placement.** The places a person goes most are along the bottom
  (Alerts, People, Me), and the decision on an emergency is pinned to the bottom of its
  screen. The top bar carries a back arrow and nothing else. On the elder's screen this
  is stricter: what is read sits at the top and what is pressed sits at the bottom. That
  covers the help button, **I am all right, stop this**, and the ways to ask for help
  without a connection. A control that undoes something, such as **stop trying**, is
  kept away from the thumb so it is not pressed on the way to the others.
- **Feedback is felt as well as seen.** Four vibrations and no more: a press that starts
  something, something confirmed (the help button), a tick for each second of the
  countdown, and something that needs attention (an alert arriving, a call joining).
  Progress is said in words ("Sending…"), never shown as a bare spinner.
- **Light or dark is the person's choice.** The phone's setting is the default, and
  **Screen** on every account page overrides it. Emergency colours do not change with
  the mode: the help button keeps its red, with a brighter `emergencyEdge` around it in
  dark mode where the red alone is 2:1 against the page, and the countdown stays yellow.
- **Every control is a full touch target.** Text buttons, icon buttons and tabs are
  48 points in the standard scale and 72 in the elder scale, set in the theme so a new
  screen cannot forget. Text buttons are ink and underlined, never red, because red here
  means an emergency.

## Layout, in the console

Dense, because it is read at a desk by somebody looking across many records at once.

- **A frame that stays put.** The sidebar narrows to icons on a desktop and becomes a
  drawer on a phone; the header holds the breadcrumb and the account menu, and nothing
  else. No bell and no global search: the open count is already on the first section,
  and History and Users each search their own records.
- **Tables are tools.** A toolbar of filters and an export on top, a pager fixed to the
  bottom saying how much of the whole is shown, figures right-aligned in the monospaced
  face, states and bands centred. Users has a selection for bulk actions and a row menu;
  History has neither, because the console is read-only over emergencies.
- **Controls are 36 points where a mouse is used** and the full touch target where a
  finger is, chosen by the browser's own pointer media query.
- **Primary actions are ink**, not a brand colour. Red stays the emergency's alone; a
  worsening trend on the reporting screen is the one other place the warning red appears,
  and always with an arrow and a signed figure beside it.
- **The status banner leads with the state pill**, and its outline turns red only while
  nobody has taken the emergency on. It used to carry a thick coloured stripe down its
  left edge in every state. The sidebar's current page is marked by a sunk background,
  weight and a thin ink line beside it: a navigation affordance, not a coloured stripe.

Tracking and line weights are tokens like everything else: `type.tracking` tightens
large type and opens small capitals, `stroke` holds the hairline, the heavier rule (the
progress steps' connecting line and the help button's dark-mode edge) and the focus
ring.

The app follows this as of 1 October 2026 and the console as of 6 October 2026. Both use
the same words: Waiting, Being handled, Escalated, Closed, Withdrawn. The console's
history filter alone keeps the two waiting states apart, because it is for looking a
record up rather than deciding what to do.

Severity is shown the same way, after Carbon's status-indicator pattern: an octagon for
critical, a triangle for elevated, a dot for standard, each beside its word. Red as text
uses the `timer` token, which is gated as text on a surface in both themes; the
`emergency` token is a fill.

Red is never spent on anything that is not an emergency. The console's sign-in button,
its reporting window picker and its lost-connection label all used to be red and no
longer are.

## Icons

An icon beside a label, never an icon instead of one, and only where it earns its place.
An icon earns it when it does one of three things:

1. **Marks a place you go many times a day.** The console's four sections and the app's
   Open and History views each carry one, beside the word.
2. **Tells apart two actions that read alike.** "Call Grace" and "Call an emergency
   responder" both begin with "Call" and do different things. A phone and the emergency
   mark separate them before either label is read.
3. **Speeds recognition of a frequent action** under stress. The caregiver's two answers,
   and closing, each carry one.
4. **Carries meaning when colour cannot.** Every state pill and severity mark has a glyph
   for readers who cannot tell the colours apart, and the trail of what happened has one
   per entry so it reads as a sequence.

The console draws the same Material Icons the app does, copied in as SVG paths (Apache
2.0), so a glyph means the same thing on both and nothing is loaded from a CDN.

An icon that does none of these is decoration, and the design anti-patterns this project
avoids include icons scattered for texture. Icon-only controls are reserved for secondary
actions with a universally understood symbol, which in practice is sign out alone, and
every one carries an accessible name.

Glyphs are shared between an action and the state it produces, so they teach each other:
"I am on my way" and the "Being handled" pill both show a running figure, "Close this
emergency" and the "Closed" pill both show a tick.

The elder's panic control gets no icon. It is one large labelled circle, and anything added
to it competes with the only thing that screen is for.

## Type

One family per audience, and it is a legibility decision rather than a stylistic one.

| Audience | Face | Why |
| --- | --- | --- |
| Elder | Inclusive Sans, 700 throughout | Designed for accessibility and readability. A capital I, a lowercase l and a 1 cannot be confused, and the zero is slashed. That is the single most useful property a face can have on a screen somebody reads in a panic, and it is friendlier to read than the face it replaced (`docs/decisions.md`) |
| Caregiver, responder, administrator | Source Sans 3 | Humanist, unremarkable in a good way, and one variable file covers every weight the interface needs |
| Figures everywhere | Atkinson Hyperlegible Mono | Timers, phone numbers and codes, where digits have to line up. From the Braille Institute's low-vision research, with a slashed zero |

Headings are separated from body text by weight, not by a fourth family. All three faces
are SIL Open Font Licence.

Before anybody has signed in, the app cannot know whose phone it is, so the sign-in and
reset screens take the elder's face and sizes with regular-weight body text, and bold only
for headings and buttons. Bold throughout begins once the account is known to be an
elder's. Sign-up uses the caregiver's type, because elders are registered by their
caregiver and never sign up themselves.

Fonts are bundled into the app from `frontend/mobile/assets/fonts/` and self-hosted by the
dashboard from `frontend/dashboard/public/fonts/`. Nothing is fetched from a font CDN, which
matters for more than principle: the console reads an elder's name and address, so once
signed in it makes no third-party request at all. The one exception is before sign-in,
when Google sign-in is set up: the sign-in page fetches Google's button, and the console
reloads after signing in so the page that shows anybody's details never carries it
(`docs/running.md`, Google sign-in on the console).
The licence text ships inside the app as an asset and is registered with Flutter's licence
page, because bundling a font is distributing it and the Open Font Licence requires the
licence to travel with it.

Until 30 September 2026 this section described a set of fonts that no build ever loaded.
The tokens named IBM Plex Sans and Archivo, nothing was bundled, and both surfaces fell
back to whatever the platform supplied. The elder screen's legibility was therefore a
property of the phone rather than of a decision. Recorded here because a design language
that cannot be observed in the product is not a design language.

Weight is a token (`type.weight`) rather than a per-widget choice, because the elder
path's boldness is a decision about reading and has to be the same in both surfaces. On the
large-type screens the step above body is bold rather than semi-bold, so a button never reads
lighter than the bold sentence next to it. All three faces are variable, so the app drives
the weight axis with `fontVariations` as well as setting `fontWeight`, and changes a weight
only through `weighted()`; the dashboard declares one `@font-face` per face with its range.

None of the faces is on the list of overused interface fonts in the impeccable design
guidance (Inter, Roboto, Open Sans, Lato, Montserrat, Arial, Helvetica, Fraunces,
Instrument Sans and Serif, Geist, Mona Sans, Plus Jakarta Sans, Space Grotesk, Recoleta),
and a new face should not be either.

## Accessibility floors, asserted in tests

| Floor | Value |
| --- | --- |
| Elder body text | 20sp minimum |
| Elder touch target | 72dp minimum |
| Standard body text | 14px minimum |
| Standard touch target | 48dp minimum |
| Contrast | AA everywhere, AAA on body text and the panic control |
| Font scaling | usable at 200% system font size |

"Asserted in tests" is true of the app, where `test/accessibility_test.dart` compares
against the constants in the generated token file rather than against numbers typed into
the test, and of contrast everywhere, which the token build gates on every declared pair.
CI runs both. It is not yet true of the dashboard's touch targets.

One caution learned the hard way: a floor computed in code is not a floor enforced in
code. The panic control clamped its diameter to the elder minimum and then handed that
number to a widget that cannot exceed its parent's constraints, so a cramped layout
rendered it at 20 points. The test was right for a fortnight before anybody ran it.

Also required on every screen before it is considered done: text alternatives on all
images, icons and map views; full keyboard operation of the dashboard with visible focus
and no traps; visible persistent field labels tied by `for` and `id`; buttons named after
the action and its object; reduced-motion honoured.

## Consent, disclosure and data minimisation

- Consent recorded as a row: who consented, on whose behalf, to what, when. Unticked by
  default, not bundled with the terms, separately revocable.
- Privacy notice and terms of use are first-class screens, reachable from registration
  and settings.
- No location is ever read from the elder's phone; an alert is placed at the registered
  home or a stay the care circle recorded. A responder's phone shares where it is only
  when they turn it on, after taking an emergency on, until they arrive, and only the
  time they arrived is kept.
- The carers' numbers kept on the elder's phone for asking without a connection live in
  secure storage and are cleared at sign-out.
- No health fields. Care level is an operational field set by a caregiver, not a diagnosis.
- Retention windows are configuration, enforced by a scheduled job.
- No third-party analytics, advertising or social pixels. One strictly necessary session
  cookie in the dashboard, disclosed in the privacy notice.
- Firebase, Africa's Talking, LiveKit and the OpenStreetMap services are named as
  processors in the privacy notice.
- A named data contact with a real email and postal address appears in the privacy notice
  and the dashboard footer.

## Claims the product must not make

No guaranteed response time, no "24/7 monitoring", no medical or fall-detection claims,
no suggestion that the system replaces emergency services. Registration states plainly
that the user should also call emergency services on 999 or 112 where they can. Progress
is reported in words, never a bare spinner.
