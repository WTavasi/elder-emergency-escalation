# Design language, enforceable constraints

Version 0.2. The narrative version with swatches and rationale is kept in the project
documentation. This file is the part that code has to obey.

## Governing rule

Red is a state, not a brand colour. `red-700` and `red-600` appear only on the panic
control, on an event in `TRIGGERED` or `ESCALATED` state, and on a destructive
confirmation. Never on navigation, headers, links, empty states, charts or brand bars.

## Colour

Defined once in `frontend/design-tokens/tokens.json`. Consumed only through the generated
outputs. No hex literals in widgets or components.

Semantic hues are limited to three besides the emergency red: amber for waiting, blue
for owned, green for closed. Blue is also the focus-ring colour. Escalation tiers get a
number and a role name, never a colour of their own.

## State appearance

| State | Appearance | Meaning |
| --- | --- | --- |
| `TRIGGERED` | filled red pill, glyph and word | created, nobody notified yet |
| `NOTIFIED` | amber pill | dispatched, ack timer running |
| `ACKNOWLEDGED` | blue pill | someone owns it |
| `ESCALATED` | outlined red pill | a tier timed out |
| `RESOLVED` | green pill | closed with an outcome |
| `CANCELLED` | neutral pill | withdrawn inside the grace window |

Filled red means nobody has seen it. Outlined red means the system acted on it. Colour
never carries state alone: every pill also carries a glyph and a word.

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
| Elder | Atkinson Hyperlegible, 700 throughout | Drawn by the Braille Institute for low vision. Its letterforms are deliberately differentiated, so b and d, 1 and l and I, and O and 0 cannot be confused. That is the single most useful property a face can have on a screen somebody reads in a panic |
| Caregiver, responder, administrator | Source Sans 3 | Humanist, unremarkable in a good way, and one variable file covers every weight the interface needs |
| Figures everywhere | IBM Plex Mono | Timers, scores and identifiers, where digits have to line up |

Headings are separated from body text by weight, not by a fourth family. All three faces
are SIL Open Font Licence.

Fonts are bundled into the app from `frontend/mobile/assets/fonts/` and self-hosted by the
dashboard from `frontend/dashboard/public/fonts/`. Nothing is fetched from a font CDN, which
matters for more than principle: the console reads an elder's name and address, so it
makes no third-party request at all, and the API's content security policy would deny one.
The licence text ships inside the app as an asset and is registered with Flutter's licence
page, because bundling a font is distributing it and the Open Font Licence requires the
licence to travel with it.

Until 30 September 2026 this section described a set of fonts that no build ever loaded.
The tokens named IBM Plex Sans and Archivo, nothing was bundled, and both surfaces fell
back to whatever the platform supplied. The elder screen's legibility was therefore a
property of the phone rather than of a decision. Recorded here because a design language
that cannot be observed in the product is not a design language.

Weight is a token (`type.weight`) rather than a per-widget choice, because the elder
path's boldness is a decision about reading and has to be the same in both surfaces.
Source Sans 3 is variable, so the app drives the weight axis with `fontVariations` as well
as setting `fontWeight`; the dashboard declares one `@font-face` with a `200 900` range.

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
the test, and of contrast everywhere, which the token build gates on 26 declared pairs.
It is not yet true of the dashboard's touch targets, and no continuous integration job
runs the app's tests, so that assertion currently depends on somebody running them.

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
- No continuous or background location. One capture at trigger, one at acknowledgement.
- No health fields. Care level is an operational field set by a caregiver, not a diagnosis.
- Retention windows are configuration, enforced by a scheduled job.
- No third-party analytics, advertising or social pixels. One strictly necessary session
  cookie in the dashboard, disclosed in the privacy notice.
- Firebase, Africa's Talking and Google Maps are named as processors in the privacy notice.
- A named data contact with a real email and postal address appears in the privacy notice
  and the dashboard footer.

## Claims the product must not make

No guaranteed response time, no "24/7 monitoring", no medical or fall-detection claims,
no suggestion that the system replaces emergency services. Registration states plainly
that the user should also call emergency services on 999 or 112 where they can. Progress
is reported in words, never a bare spinner.
