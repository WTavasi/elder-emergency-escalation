# Design language, enforceable constraints

Version 0.2. The narrative version with swatches and rationale is kept in the project
documentation. This file is the part that code has to obey.

## Governing rule

Red is a state, not a brand colour. `red-700` and `red-600` appear only on the panic
control, on an event in `TRIGGERED` or `ESCALATED` state, and on a destructive
confirmation. Never on navigation, headers, links, empty states, charts or brand bars.

## Colour

Defined once in `packages/tokens/tokens.json`. Consumed only through the generated
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

## Type

IBM Plex Sans for all readable text, Archivo ExtraBold for timer numerals only, IBM Plex
Mono for identifiers and timestamps. Both families are SIL Open Font Licence. Fonts are
bundled with the app and self-hosted in the dashboard, not loaded from a third-party CDN.

## Accessibility floors, asserted in tests

| Floor | Value |
| --- | --- |
| Elder body text | 20sp minimum |
| Elder touch target | 72dp minimum |
| Standard body text | 14px minimum |
| Standard touch target | 48dp minimum |
| Contrast | AA everywhere, AAA on body text and the panic control |
| Font scaling | usable at 200% system font size |

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
