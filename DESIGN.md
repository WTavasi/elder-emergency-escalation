---
name: MzaziCare
description: Emergency escalation for older people cared for at home. One press, or one text, reaches the people who look after them.
colors:
  emergency-red: "#9B0F1C"
  emergency-red-pressed: "#7D0E18"
  emergency-edge: "#D11F2C"
  on-emergency: "#FFFFFF"
  caution-yellow: "#FFD100"
  caution-track: "#D9AE00"
  on-caution: "#0E1418"
  focus-blue: "#1A4FB0"
  selection-blue: "#DBE6FA"
  waiting-amber-ink: "#7A3E00"
  waiting-amber-wash: "#FFF8EB"
  owned-blue-ink: "#123A87"
  owned-blue-wash: "#F0F5FE"
  closed-green-ink: "#0B5138"
  closed-green-wash: "#EFF9F4"
  ink: "#0E1418"
  ink-soft: "#47565E"
  ink-faint: "#5C6C74"
  control-grey: "#64757D"
  hairline: "#D7DFE2"
  page: "#F5F8F9"
  surface: "#FFFFFF"
  surface-sunk: "#E8EDEF"
typography:
  elder-display:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1.05
  elder-title:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.15
  elder-body:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.35
  elder-label:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  app-large-title:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.15
  app-title:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
  app-headline:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  app-body:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.35
  app-subheadline:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.35
  app-label:
    fontFamily: "SF Pro, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.6px"
  console-large-title:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  console-title:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  console-headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  console-body:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  console-subheadline:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  console-footnote:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  input: "4px"
  card: "8px"
  sheet: "12px"
  control: "8px"
  elder-card: "16px"
  pill: "999px"
  app-field: "10px"
  app-button: "12px"
  app-group: "12px"
  app-sheet-top: "16px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
  "48": "48px"
  "64": "64px"
components:
  panic-button:
    backgroundColor: "{colors.emergency-red}"
    textColor: "{colors.on-emergency}"
    typography: "{typography.elder-display}"
    rounded: "{rounded.pill}"
  countdown-stop:
    backgroundColor: "{colors.on-caution}"
    textColor: "{colors.caution-yellow}"
    typography: "{typography.elder-label}"
    rounded: "{rounded.app-button}"
    height: "72px"
  button-filled-app:
    backgroundColor: "{colors.emergency-red}"
    textColor: "{colors.on-emergency}"
    typography: "{typography.app-headline}"
    rounded: "{rounded.app-button}"
    height: "50px"
  button-grey-app:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.app-headline}"
    rounded: "{rounded.app-button}"
    height: "50px"
  button-primary-console:
    backgroundColor: "{colors.emergency-red}"
    textColor: "{colors.on-emergency}"
    typography: "{typography.console-headline}"
    rounded: "{rounded.control}"
    height: "36px"
  button-grey-console:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.console-headline}"
    rounded: "{rounded.control}"
    height: "36px"
  button-call:
    backgroundColor: "{colors.waiting-amber-wash}"
    textColor: "{colors.waiting-amber-ink}"
    rounded: "{rounded.app-button}"
    height: "50px"
  state-pill-owned:
    backgroundColor: "{colors.owned-blue-wash}"
    textColor: "{colors.owned-blue-ink}"
    rounded: "{rounded.pill}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.app-field}"
---

# Design System: MzaziCare

The visual system, in the DESIGN.md format the impeccable design guidance uses
(https://github.com/pbakaus/impeccable). The front matter above is normative and is a
copy of `frontend/design-tokens/tokens.json` in its light theme; the tokens file is the
source, and the dark theme lives there. Product truth is in [PRODUCT.md](PRODUCT.md); the
enforceable rules this summarises are in
[docs/design-language.md](docs/design-language.md).

## Overview

**Creative North Star: "The Emergency Card"**

The medical card a phone keeps on its lock screen: plain, legible at a glance from arm's
length, nothing on it that is not information, and one red thing that means a person is
needed. Every screen is measured against it. If a stranger picking up the phone could not
tell within a second what is happening and what to press, the screen is not done.

An iPhone app in the app, and a Mac app in the console, dense and tool-like because it is
read at a desk. Both follow Apple's conventions. The app: the phone's own face (SF Pro) on Apple's type scale, 20-point margins,
rounded solid buttons, and questions as sheets that slide up from the bottom. Type and
spacing do the work boxes would otherwise do: lists run edge to edge under hairlines,
sections open with a small-capitals label, and there are almost no cards. Colour is spent
on state, and on the way in, where MzaziCare's red fills the top of the screen. Elder
mode is the same app at a larger size (22pt semibold body, 72pt buttons); it starts on
for an elder and anybody can switch it. The elder's screen has the help button in the
middle, where what replaces it appears too, and what the elder does next at the bottom,
under the thumb. The console: the computer's own face, a grey sidebar, a large title on
each page under a bar that turns translucent as the page scrolls, lists rather than
spreadsheets, and questions as sheets with their buttons at the bottom right.

**Key Characteristics:**

- One red thing per screen, and it always means a person is needed.
- Yellow means "you can still act": the ten seconds to stop an alert, and no connection.
- State is said three ways: a glyph, a word and a colour, never colour alone.
- One face everywhere, the device's own, larger in Elder mode rather than different.
- Felt as well as seen: four vibrations, each with one meaning.

## Colors

Cool, tinted neutrals with four state hues and one emergency red; nothing is pure black
or grey, and every pair is gated for contrast in CI in both themes.

### Primary

- **Emergency Red** (emergency-red): the help button, an emergency nobody has answered,
  and a destructive confirmation. On the elder's no-connection screen it is the first way
  to ask for help. Also, under review, the filled buttons and text links of both the app
  and the console (see the One Red Rule).
- **Emergency Edge** (emergency-edge): the help button's outline in dark mode, where the
  red alone is 2:1 against the page; the console banner's outline while nobody has the
  emergency.

### Secondary

- **Caution Yellow** (caution-yellow) with **On-Caution Ink** (on-caution): the elder's
  ten seconds to stop an alert fill the screen with it, and the no-connection band uses
  it. The same in light and dark mode, at 12.7:1.
- **Focus Blue** (focus-blue): focus rings and the text caret.

### Tertiary

- **Waiting Amber**, **Owned Blue**, **Closed Green** (their ink and wash pairs): the
  state pills, and amber for buttons that ring a person.

### Neutral

- **Ink** (ink): text, and selected controls.
- **Soft Ink** and **Faint Ink**: secondary text and captions, AAA and AA respectively.
- **Control Grey** (control-grey): field outlines at 3:1, unselected controls.
- **Hairline** (hairline): dividers.
- **Page**, **Surface**, **Sunk Surface**: the page, cards and fields, and selected tabs.

### Named Rules

**The One Red Rule.** Red appears only where a person is needed: the help button, an
unanswered emergency, a destructive confirmation. A selected switch, a ticked box, a
spinner or a caret is never red. Two exceptions: MzaziCare's red on the way in (across the
top of the app's screens, down the side of the console's sign-in), where no emergency can
be on screen yet; and the filled buttons and text links of the app and the console, which
take the red as an Apple app's controls take its tint, and are under review.

**The You-Can-Still-Act Rule.** Yellow is spent on exactly two moments on the elder's
screen, and never as decoration.

## Typography

**App:** the phone's own face. SF Pro on an iPhone (its Display cut from 20 points up,
its Text cut below, as Apple sets them), Roboto on Android. Nothing is bundled.
**Console:** the computer's own face (`system-ui`): SF Pro on a Mac, Segoe UI on
Windows. Nothing is bundled, and figures take the same face with tabular digits.

**Character:** In the app, Apple's own type, because a person reading in a hurry should
not have to adjust to anything. The same face for everybody; Elder mode makes it larger
and heavier, it does not change it.

### Hierarchy (app, standard / Elder mode)

- **Display** (700, 40 / 56): "Get help" on the help button; the countdown's seconds.
- **Large Title** (700, 34 / 40): a page's title, left-aligned.
- **Title 2** (700, 22 / 28): the heading of a step or a sheet.
- **Headline** (600 / 700, 17 / 22): names in lists, and every button.
- **Body** (400 / 600, 17 / 22): everything a person reads.
- **Subheadline** (400 / 600, 15 / 20): secondary text in the softer ink. Nothing a
  person has to read is smaller.
- **Label** (600 / 700, 13 / 20, opened out, small capitals): section labels over a
  hairline, as the Settings app heads its groups.
- **Figures:** the same face with tabular digits, so times, phone numbers, codes and the
  countdown line up and do not jitter as they change.

### Hierarchy (console)

Apple's steps for a Mac, a little smaller than the phone's, because the console is read at
a desk and holds many records at once.

- **Large Title** (700, 28): a page's title, under its bar.
- **Title** (700, 17): a section's heading.
- **Headline** (600, 15): names in lists, and every button.
- **Body** (400, 15): everything a person reads.
- **Subheadline** (400, 13): secondary lines in the softer ink.
- **Footnote** (600, 12): column headings, in title case rather than spaced capitals.

### Named Rules

**The One-Face Rule.** The app has one face, the phone's. Elder mode changes size and
weight, never the family, so a screen reads the same in both.

**The Not-On-The-List Rule.** No face that MzaziCare chooses and ships comes from
impeccable's overused list (Inter, Roboto, Open Sans, Lato, Montserrat, Arial, Helvetica,
Fraunces, Instrument Sans and Serif, Geist, Mona Sans, Plus Jakarta Sans, Space Grotesk,
Recoleta). The phone's own face is not a choice in that sense: it is what every other
app on the phone is set in, Roboto on Android included.

## Layout

An 8-point rhythm (4, 8, 12, 16, 24, 32, 48, 64). In the app, Apple's side margins: 20pt,
or 16pt on the narrowest phones, the same on every screen; lists run edge to edge, one row
per item, divided by hairlines; each screen opens with one large left-aligned title. The
screens on the way in (sign in, sign up, reset) put MzaziCare's red across the top with a
curved lower edge and the form below it, low on the screen where the thumb is. Places people go often
sit in a bottom bar (Alerts, People, Me), and the decision on an emergency is pinned to
the bottom of its screen. On the elder's screen the help button and the countdown's ring
share one layout and one size, so the ring appears exactly where the button was; what the
elder does next (stop, text, call, go back) sits at the bottom, in the reach of a thumb.
Buttons are 50pt tall, 72pt in Elder mode; no touch target is under 48pt (72pt in Elder
mode), and the console uses 36pt where a mouse is detected. The console is laid out as a Mac
window: a grey sidebar with the sections, their counts and the account at its foot, which
can be hidden, and becomes a drawer on a phone; on each page, a bar that holds its actions
and shows the page's name once the large title has scrolled under it. Records are lists:
a whole row opens what it shows, with a chevron at its end.

## Elevation & Depth

Flat. Depth comes from tone (page, surface, sunk surface) and hairlines, not shadows.
Material's elevation tint is switched off, because it would tint every surface with the
emergency red. In the console, chart tooltips, menus and sheets carry a single soft
shadow to show they float above the page, and nothing else does; the bar at the top of a
page is translucent over what scrolls beneath it, as a Mac window's is.

### Named Rules

**The Flat-By-Default Rule.** A surface is separated by tone or a hairline. A shadow is
only for something that genuinely floats above the page.

## Shapes

Rounded as iOS is in the app: 12px on buttons and grouped blocks, 10px on fields, 16px on
the top corners of a sheet, fully round for the help button and state pills. The console
rounds as a Mac does: 8px on buttons, fields and controls, 12px on lists and sheets.
Borders are hairlines; the only heavier lines are focus rings (3px), the progress steps'
connector and the help button's dark-mode edge (4px).

### Named Rules

**The No-Stripe Rule.** No coloured border down the side of a row, a message or a
banner. State is a glyph and a word, and in a list a dot at the start of the row.

## Components

### Help button

The one control the elder's app exists for: a red circle, the same size and in the same
place as the countdown ring that replaces it, with one line just above it saying what it
does, where the countdown's heading is read next. "Get help" in white at display size, no
icon. A firm vibration on press;
grey with "Sending…" while the request travels. In dark mode, a brighter red edge.

### Countdown

The ten seconds to stop an alert: the whole screen in Caution Yellow, the seconds inside
a ring that empties, a light vibration each second, and "I am all right, stop this" at
the bottom in the darkest ink with yellow text.

### Buttons

- **Shape:** solid with rounded corners (12px) in the app, full width, 50pt tall (72pt in
  Elder mode); 8px corners in the console, as wide as their words.
- **Filled:** MzaziCare red, for the one action a screen leads to, in the app and the
  console alike. The colour is under review, because it puts red on actions that are not
  emergencies, such as signing in and saving; see "Don't" below.
- **Secondary:** ink on the sunk grey, no outline, as Apple's grey buttons are.
- **Text:** MzaziCare red, not underlined (in the console, underlined under the pointer),
  as an Apple app's links take its tint. Under review with the filled button.
- **Call buttons:** amber wash with amber ink, because they reach a person.
- **Focus:** a 3px Focus Blue ring.

### State pills and marks

A glyph and a word in the state's ink (Waiting, Being handled, Escalated, Closed,
Withdrawn); pills in table cells in the console. Severity is an octagon, a triangle or a
dot beside its word.

### Inputs / Fields

Filled with the surface, a Control Grey outline at 3:1, and a 3px Focus Blue outline on
focus. The caret is Focus Blue and the selection is Selection Blue, never red.

### Notices

An error or information mark and the words beside it, no box: errors in the text-safe
red, information in ink.

### Sheets and switches

Every question, choice or notice is a sheet that slides up from the bottom
(`showActionSheet`): a grab handle, rounded top corners, a short title, a line saying what
will happen, then the answers as rows with an icon each, the way back out last. The answer
the question leads to can be a full-width button above the rows, red when it ends
something. It is dismissed by swiping it down. Switches are iOS's own on iPhone.

Before the phone asks for a permission, a sheet says why in a sentence and has one
button, Continue, after which the phone's own question appears. Permission is asked when
the person presses the thing that needs it, never at start-up.

In the console a question is a Mac sheet: it drops from the top of the window, with no
close button, a form's labels right-aligned in a column to the left of their fields, and
its buttons at the bottom right, the one that goes ahead last. A confirmation is a
narrower alert. A choice between a few things is a segmented control, a grey track with
the chosen segment raised on it.

### Navigation

A bottom bar in the app with a sunk-surface pill on the current tab and a red badge
with the number nobody has answered. In the console, a grey sidebar whose current page is
a rounded grey selection, never red, with each section's count beside it.

## Do's and Don'ts

### Do:

- **Do** keep red for a person being needed, and nothing else.
- **Do** say every state three ways: glyph, word and colour.
- **Do** keep the help button and the countdown ring the same size in the same place,
  and put what the elder does next at the bottom.
- **Do** take every colour, size and duration from `frontend/design-tokens`, and add a
  contrast pair for any new colour.
- **Do** set figures with tabular digits (`.figures`).
- **Do** honour Reduce Motion: movement collapses to an instant change.
- **Do** use `showActionSheet` for a question or notice, and adaptive switches.
- **Do** say why before the phone asks for a permission, at the moment it is needed.
- **Do** take sizes from the theme (`MzaziSizes`, the text theme), so Elder mode reaches
  every screen.

### Don't:

- **Don't** colour a selected control, a spinner or a caret with the emergency red.
- **Don't** add a coloured stripe down the edge of a row, message or banner.
- **Don't** bundle a face in the app or the console.
- **Don't** put a card, a gradient, glass or a decorative shadow on a working screen. The
  console's bar at the top of a page is the one translucent thing, as a Mac window's is.
- **Don't** show a bare spinner where a sentence could say what is happening.
- **Don't** add new uses of the red filled button for actions that are not emergencies
  while the filled-button colour is under review.
