# Design language, enforceable constraints

Version 0.3. The narrative version with swatches and rationale is kept in the project
documentation. This file is the part that code has to obey.

## Governing rule

Red is a state, not a brand colour. `red-700` and `red-600` appear only on the panic
control, on an event in `TRIGGERED` or `ESCALATED` state, and on a destructive
confirmation. Never on navigation, headers, empty states, charts or brand bars.

Two exceptions are allowed and both are under review. The screens before sign-in carry
MzaziCare's red, because no emergency can be on screen yet. And the filled buttons and
text links of the app and the console take the red, as an Apple app's controls take its
tint, which puts red on actions such as signing in and saving. No new use of either may be
added while the review is open.

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
slightly deeper one, draws the rings behind the app's screens before sign-in. The
console's sign-in no longer uses it: since 29 October 2026 its rings are faint white over
MzaziCare's red, as the app's way-in screens draw them. They carry no meaning and are in no contrast pair, which is only
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
- **Figures with tabular digits** (`.figures`, in the app and the console): ages, ranks
  in a chain, phone numbers, the countdown. They line up down a
  column and do not jitter as they change.
- **Apple's margins and steps.** A page's side margin is 20 points, 16 on the narrowest
  phones (`MzaziLayout.margin`), the same on every screen. Text takes Apple's named steps
  (large title, title, headline, body, subheadline, footnote) from the theme.
- **The way in has a colour.** Sign-in, sign-up and the reset screens put MzaziCare's red
  across the top, with the care rings faint in white and a curved lower edge, and the form
  below it, low on the screen in the reach of a thumb (`AuthFrame`). The red is the same in
  light and dark mode. No emergency can be on screen before sign-in, so the red there
  cannot be mistaken for one.
- **The thumb decides placement.** The places a person goes most are along the bottom
  (Alerts, People, Me), and the decision on an emergency is pinned to the bottom of its
  screen. The top bar carries a back arrow and nothing else. On the elder's screen the
  help button and the countdown's ring that replaces it are the same size in the same
  place, so pressing turns the red disc into the ring where it was and the eye never has
  to look for it. The two screens share one layout: the band above the circle is as tall
  as the countdown's heading, the band below as tall as the button's explanation, both
  measured at the current width and text size. On the smallest phones, where that would
  leave a circle under 144 points, the screen scrolls instead. What the elder does next sits at the bottom, in the reach
  of a thumb: **I am all right, stop this**, the ways to ask for help without a
  connection, **Back to the help button**. A control that undoes something, such as
  **stop trying**, is kept away from the thumb so it is not pressed on the way to the
  others.
- **Feedback is felt as well as seen.** Four vibrations and no more: a press that starts
  something, something confirmed (the help button), a tick for each second of the
  countdown, and something that needs attention (an alert arriving, a call joining).
  Progress is said in words ("Sending…"), never shown as a bare spinner.
- **Every pop-up is a sheet from the bottom.** A question, a choice or a notice slides
  up from the bottom (`showActionSheet`), where the thumb already is: a grab handle,
  rounded top corners, a title, a line saying what will happen, and the answers as rows
  with an icon each, the way back out last, as iOS places Cancel. The answer the question
  leads to may be a full-width button above the rows; it is red only when it ends,
  removes or stops something, which is a destructive confirmation and so allowed. A sheet
  takes the app's current size, so an elder's is as large as the rest of their app.
  Switches are adaptive, so iOS's own on iPhone.
- **Permission is asked when it is needed, after saying why.** Nothing is asked at
  start-up. When a person presses something that needs a permission the phone has not
  given, a sheet says in a sentence what it is for and has one button, Continue; the
  phone's own question follows. A retry asks the phone again rather than only checking,
  because on an iPhone "not asked yet" and an expired "Allow Once" both read as refused,
  and a retry that only checks can never succeed.
- **Selected controls are ink, never the emergency red.** Material colours an "on"
  switch, a ticked box, a chosen radio, a slider and a spinner from the primary colour,
  and the primary colour here is the emergency red. The theme sets them all to ink, and
  the caret to the focus blue, so red still means a person is needed.
- **Light or dark is the person's choice.** The phone's setting is the default, and
  **Screen** on every account page overrides it. Emergency colours do not change with
  the mode: the help button keeps its red, with a brighter `emergencyEdge` around it in
  dark mode where the red alone is 2:1 against the page, and the countdown stays yellow.
- **Every control is a full touch target.** Text buttons, icon buttons and tabs are
  48 points in the standard size and 72 in Elder mode, set in the theme so a new screen
  cannot forget. Full-width buttons are solid with 12-point corners and 50 points tall, 72
  in Elder mode (`MzaziSizes.control`); the secondary one is ink on the sunk grey with no
  outline. Text buttons are MzaziCare red without an underline, as an iPhone app's links
  take its tint. Red buttons and links in the app are under review, because red is meant
  to mean an emergency.
- **The alert trail is numbered.** What has happened on an emergency is a column of
  numbered circles joined by a line, the latest filled in, as the console draws the chain.
- **A swipe covers its words.** As the knob of a swipe-to-confirm moves, the track fills
  behind it and the words fade, so nothing is read through the knob.

## Layout, in the console

A Mac app, after Mail and System Settings, and dense, because it is read at a desk by
somebody looking across many records at once.

- **A window frame.** A grey sidebar holds the sections, each with its count, and the
  account at its foot, which opens a small menu upwards. The current section is a rounded
  grey selection, never red. A button at its top hides it, and the same button in the
  page's bar brings it back; on a phone it is a drawer behind that button. No bell and no
  global search: the open count is already on the first section, and History and Users
  each search their own records. The browser tab is named after the page, with the number
  nobody has answered in front, so a background tab still says somebody is needed.
- **Each page has a bar and a large title.** The bar along the top holds the page's
  actions and, on an emergency, the way back; it turns translucent, with a hairline, once
  something scrolls under it, and the page's name appears in its middle once the large
  title has gone.
- **Records are lists.** A whole row opens what it shows, with a chevron at its end; the
  name is the link or button, so the keyboard reaches it, and the up and down arrows move
  between rows. An emergency nobody has answered has a red dot before the name, as an
  unread message has in Mail. Column headings are small and in title case and stay in
  view as the list scrolls. On a phone a list becomes stacked rows, each value with its
  heading beside it.
- **Filters apply as they are chosen.** A search, pop-up menus and a range of dates, with
  no Apply button; Command-F or Ctrl+F puts the cursor in the search. A pager fixed to the
  bottom says how much of the whole is shown. Users can be chosen several at a time only
  after pressing Select, as in Photos; History cannot, because the console is read-only
  over emergencies.
- **Questions are sheets.** A sheet drops from the top of the window with no close
  button; a form's labels are right-aligned in a column to the left of its fields; the
  buttons are at the bottom right, the one that goes ahead last and in MzaziCare red, the
  grey Cancel before it. A confirmation is a narrower alert. A choice between a few things
  is a segmented control: a grey track with the chosen segment raised on it in white.
- **What happened is told in sentences.** An emergency's record reads as the app's does,
  "Sent to Aisha Wanjiru and Brian Wanjiru", as numbered steps with the latest filled in.
  The delivery attempts behind it are hidden under a disclosure until asked for.
- **How fresh the board is, in small words.** "Updated just now" and a refresh button
  beside it, as Mail says it; times on the live board are "4 min ago", with the exact time
  on hover.
- **Controls are 36 points where a mouse is used** and the full touch target where a
  finger is, chosen by the browser's own pointer media query.
- **Filled buttons and links are MzaziCare red**, under review as the app's are (see the
  governing rule); other buttons are ink on the sunk grey with no outline. A worsening
  trend on the reporting screen is the one other place the warning red appears, and
  always with an arrow and a signed figure beside it.
- **The parts the browser draws carry the design too.** Text selection takes the
  `selection` token, gated against body text in both themes; the caret is the focus blue;
  scrollbars are the control grey on the sunk surface, at full width so they are easy to
  grab. The app's fields follow the same rule: Material would colour the caret and the
  selection with the emergency red.
- **The status banner leads with the state pill**, and its outline turns red only while
  nobody has taken the emergency on. It used to carry a thick coloured stripe down its
  left edge in every state.

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

Red is never spent on anything that is not an emergency, save the two exceptions under
review in the governing rule. The console's reporting window picker and its
lost-connection label used to be red and no longer are; its sign-in button was ink from
6 October and took MzaziCare red again on 29 October 2026 with the console's other filled
buttons.

## Icons

An icon beside a label, never an icon instead of one, and only where it earns its place.
An icon earns it when it does one of three things:

1. **Marks a place you go many times a day.** The console's sections and the app's
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
actions with a universally understood symbol, which in practice are the console's
refresh, the button that hides and shows its sidebar, and the "…" that opens a row's menu,
as on a Mac, and every one carries an accessible name.

Glyphs are shared between an action and the state it produces, so they teach each other:
"I am on my way" and the "Being handled" pill both show a running figure, "Close this
emergency" and the "Closed" pill both show a tick.

The elder's panic control gets no icon. It is one large labelled circle, and anything added
to it competes with the only thing that screen is for.

## Type

In the app, one face for everybody: the phone's own. SF Pro on an iPhone, its Display cut
from 20 points up and its Text cut below, as Apple sets them; Roboto on Android. It is
named on every text style (`MzaziTheme.systemFamily`) rather than inherited, because some
widgets, buttons among them, take a style from the theme as it is.

| | Standard | Elder mode |
| --- | --- | --- |
| Large title (a page's title) | 34, bold | 40, bold |
| Title 2 (a step or a sheet) | 22, bold | 28, bold |
| Headline (names, buttons) | 17, semibold | 22, bold |
| Body | 17, regular | 22, semibold |
| Subheadline (secondary text) | 15, regular | 20, semibold |
| Footnote (section labels) | 13, semibold, small capitals | 20, bold, small capitals |

The standard sizes are Apple's own defaults at the phone's normal text size. Every size
follows the phone's text-size setting from there.

**Elder mode** is the larger size: the same face, the same layout, larger text and taller
buttons. It starts on for an elder's account and off for everybody else, and anybody can
switch it on their own page (**Screen**, **Elder mode**); the choice is kept on the phone
and holds before sign-in too, so an elder's phone stays large on the sign-in screen. A
screen takes its sizes from the theme (`MzaziSizes`, the text theme) and never asks whose
account it is, so the switch reaches every screen.

In the console, the computer's own face too (`system-ui`, the `type.family.system` token):
SF Pro on a Mac, Segoe UI on Windows. Figures take the same face with tabular digits
(`.figures`). Sizes are Apple's steps for a Mac (`type.console`):

| Step | Size |
| --- | --- |
| Large title (a page's title) | 28, bold |
| Title 1 | 22, bold |
| Title 2 (a section's heading) | 17, bold |
| Headline (names, buttons) | 15, semibold |
| Body | 15, regular |
| Callout | 14, regular |
| Subheadline (secondary lines) | 13, regular |
| Footnote (column headings) | 12, semibold, title case |

Nothing is bundled and nothing is fetched from a font CDN, which matters for more than
principle: the console reads an elder's name and address, so once signed in it makes no
third-party request at all. The one exception is
before sign-in, when Google sign-in is set up: the sign-in page fetches Google's button,
and the console reloads after signing in so the page that shows anybody's details never
carries it (`docs/running.md`, Google sign-in on the console).

The app bundled its own faces from 30 September to 26 October 2026: Inclusive Sans for the
elder, Source Sans 3 for everybody else and Atkinson Hyperlegible Mono for figures. The
console self-hosted Source Sans 3 and Atkinson Hyperlegible Mono until 29 October 2026.
Why both changed, and what was given up, is in `docs/decisions.md`.

Until 30 September 2026 this section described a set of fonts that no build ever loaded.
The tokens named IBM Plex Sans and Archivo, nothing was bundled, and both surfaces fell
back to whatever the platform supplied. Recorded here because a design language that
cannot be observed in the product is not a design language.

Weight is a token (`type.weight`) rather than a per-widget choice, because Elder mode's
heavier body text is a decision about reading. On the large screens the step above body is
bold rather than semi-bold, so a button never reads lighter than the sentence next to it.
A weight changes only through `weighted()`.

No face the project chooses and ships is on the list of overused interface fonts in the
impeccable design guidance (Inter, Roboto, Open Sans, Lato, Montserrat, Arial, Helvetica,
Fraunces, Instrument Sans and Serif, Geist, Mona Sans, Plus Jakarta Sans, Space Grotesk,
Recoleta), and a new one should not be either. The phone's own face is not such a choice:
it is what every other app on the phone is set in, Roboto on Android included.

## Accessibility floors, asserted in tests

| Floor | Value |
| --- | --- |
| Elder mode body text | 20pt minimum (22 by default) |
| Elder touch target | 72dp minimum |
| Standard body text | 14pt minimum (17 by default in the app) |
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
  and the console's Privacy and data panel, in the account menu.

## Claims the product must not make

No guaranteed response time, no "24/7 monitoring", no medical or fall-detection claims,
no suggestion that the system replaces emergency services. Registration states plainly
that the user should also call emergency services on 999 or 112 where they can. Progress
is reported in words, never a bare spinner.
