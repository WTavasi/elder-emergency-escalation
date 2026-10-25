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
    fontFamily: "Inclusive Sans, Source Sans 3, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-1px"
  elder-title:
    fontFamily: "Inclusive Sans, Source Sans 3, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.6px"
  elder-body:
    fontFamily: "Inclusive Sans, Source Sans 3, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.5
  elder-label:
    fontFamily: "Inclusive Sans, Source Sans 3, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  display:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-1px"
  headline:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.6px"
  title:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "1.2px"
  figures:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
rounded:
  input: "4px"
  card: "8px"
  sheet: "12px"
  elder-card: "16px"
  pill: "999px"
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
    rounded: "{rounded.input}"
    height: "72px"
  button-primary-console:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
  button-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    height: "48px"
  button-call:
    backgroundColor: "{colors.waiting-amber-wash}"
    textColor: "{colors.waiting-amber-ink}"
    rounded: "{rounded.input}"
    height: "48px"
  state-pill-owned:
    backgroundColor: "{colors.owned-blue-wash}"
    textColor: "{colors.owned-blue-ink}"
    rounded: "{rounded.pill}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
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

Swiss and utilitarian in the app, dense and tool-like in the console. Type and spacing do
the work boxes would otherwise do: lists run edge to edge under hairlines, sections open
with a small-capitals label, and there are almost no cards. Colour is spent only on state.
The elder's screens are the same system at a larger scale (22pt bold body, 72pt targets),
laid out for one hand, with what is read at the top and what is pressed at the bottom.

**Key Characteristics:**

- One red thing per screen, and it always means a person is needed.
- Yellow means "you can still act": the ten seconds to stop an alert, and no connection.
- State is said three ways: a glyph, a word and a colour, never colour alone.
- Legibility over character: faces that keep I, l and 1 apart, and a slashed zero.
- Felt as well as seen: four vibrations, each with one meaning.

## Colors

Cool, tinted neutrals with four state hues and one emergency red; nothing is pure black
or grey, and every pair is gated for contrast in CI in both themes.

### Primary

- **Emergency Red** (emergency-red): the help button, an emergency nobody has answered,
  and a destructive confirmation. Nothing else. On the elder's no-connection screen it is
  the first way to ask for help.
- **Emergency Edge** (emergency-edge): the help button's outline in dark mode, where the
  red alone is 2:1 against the page; the console banner's outline while nobody has the
  emergency.

### Secondary

- **Caution Yellow** (caution-yellow) with **On-Caution Ink** (on-caution): the elder's
  ten seconds to stop an alert fill the screen with it, and the no-connection band uses
  it. The same in light and dark mode, at 12.7:1.
- **Focus Blue** (focus-blue): focus rings, the text caret, links, and the iOS tint.

### Tertiary

- **Waiting Amber**, **Owned Blue**, **Closed Green** (their ink and wash pairs): the
  state pills, and amber for buttons that ring a person.

### Neutral

- **Ink** (ink): text, and primary actions in the console.
- **Soft Ink** and **Faint Ink**: secondary text and captions, AAA and AA respectively.
- **Control Grey** (control-grey): field outlines at 3:1, unselected controls.
- **Hairline** (hairline): dividers.
- **Page**, **Surface**, **Sunk Surface**: the page, cards and fields, and selected tabs.

### Named Rules

**The One Red Rule.** Red appears only where a person is needed: the help button, an
unanswered emergency, a destructive confirmation. A selected switch, a ticked box, a
spinner or a caret is never red.

**The You-Can-Still-Act Rule.** Yellow is spent on exactly two moments on the elder's
screen, and never as decoration.

## Typography

**Display Font:** Source Sans 3 (with system-ui)
**Body Font:** Source Sans 3 for caregivers, responders, volunteers and the console;
Inclusive Sans for the elder and the screens before sign-in
**Label/Mono Font:** Atkinson Hyperlegible Mono, for figures only

**Character:** One family per audience, chosen for legibility first. Inclusive Sans is
friendly and open with every confusable letter distinct; Source Sans 3 is humanist and
unremarkable in a good way; the mono is the Braille Institute's.

### Hierarchy

- **Elder Display** (700, 56px, 1.05): "Get help" on the help button; the countdown.
- **Elder Title** (700, 32px, 1.1): the elder's name; the state of their emergency.
- **Elder Body** (700, 22px, 1.5): everything the elder reads. Bold throughout.
- **Headline** (700, 28px, 1.1): page titles for everyone else, left-aligned.
- **Title** (600, 22px): names in lists and sections.
- **Body** (400, 16px, 1.5): everything else; 14px is the floor.
- **Label** (600, 14px, 1.2px tracking, small capitals): section labels over a hairline.
- **Figures** (Atkinson Hyperlegible Mono): times, phone numbers, codes, the countdown,
  so digits line up and do not jitter as they change.

### Named Rules

**The No-Ambiguous-Letters Rule.** Any face that reaches an elder must keep I, l and 1
apart and slash its zero. Faces that draw I and l alike are ruled out for the elder,
however good they look.

**The Not-On-The-List Rule.** No face from impeccable's overused list (Inter, Roboto,
Open Sans, Lato, Montserrat, Arial, Helvetica, Fraunces, Instrument Sans and Serif,
Geist, Mona Sans, Plus Jakarta Sans, Space Grotesk, Recoleta).

## Layout

An 8-point rhythm (4, 8, 12, 16, 24, 32, 48, 64). In the app, 24pt side margins on the
elder's screens and 16pt elsewhere; lists run edge to edge, one row per item, divided by
hairlines; each screen opens with one large left-aligned title. Places people go often
sit in a bottom bar (Alerts, People, Me), and the decision on an emergency is pinned to
the bottom of its screen. On the elder's screen what is read sits at the top and what is
pressed at the bottom, in the reach of a thumb. Elder targets are 72pt, others 48pt, and
the console uses 36pt where a mouse is detected. The console keeps a fixed sidebar that
narrows to icons on a desktop and becomes a drawer on a phone.

## Elevation & Depth

Flat. Depth comes from tone (page, surface, sunk surface) and hairlines, not shadows.
Material's elevation tint is switched off, because it would tint every surface with the
emergency red. In the console, chart tooltips, menus and dialogs carry a single soft
shadow to show they float above the page, and nothing else does.

### Named Rules

**The Flat-By-Default Rule.** A surface is separated by tone or a hairline. A shadow is
only for something that genuinely floats above the page.

## Shapes

Square-ish and quiet: 4px on buttons and fields, 8px on the few cards (16px on the
elder's), 12px on sheets and dialogs, fully round only for the help button and state
pills. Borders are hairlines; the only heavier lines are focus rings (3px), the progress
steps' connector and the help button's dark-mode edge (4px).

### Named Rules

**The No-Stripe Rule.** No coloured border down the side of a row, a message or a
banner. State is a glyph and a word, and in a list a dot at the start of the row.

## Components

### Help button

The one control the elder's app exists for: a red circle filling the width of the screen
at the bottom, "Get help" in white at display size, no icon. A firm vibration on press;
grey with "Sending…" while the request travels. In dark mode, a brighter red edge.

### Countdown

The ten seconds to stop an alert: the whole screen in Caution Yellow, the seconds inside
a ring that empties, a light vibration each second, and "I am all right, stop this" at
the bottom in the darkest ink with yellow text.

### Buttons

- **Shape:** gently squared (4px).
- **Console primary:** ink with white text. Red is never a primary action colour there.
- **App filled:** currently the emergency red by default. This is under review, because
  it puts red on actions that are not emergencies, such as signing in and saving; see
  "Don't" below.
- **Outlined:** ink text, Control Grey outline.
- **Text:** ink, underlined, never red.
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

### Alerts and switches

iOS's own alert and switch on iPhone, Material's elsewhere, through one helper. An
elder's alert keeps the elder's type inside iOS's frame.

### Navigation

A bottom bar in the app with a sunk-surface pill on the current tab and a red badge
with the number nobody has answered. In the console, a sidebar whose current page is
marked by a sunk background, weight, and a thin ink line beside it.

## Do's and Don'ts

### Do:

- **Do** keep red for a person being needed, and nothing else.
- **Do** say every state three ways: glyph, word and colour.
- **Do** put what the elder presses at the bottom of the screen and what they read above.
- **Do** take every colour, size and duration from `frontend/design-tokens`, and add a
  contrast pair for any new colour.
- **Do** set figures in Atkinson Hyperlegible Mono.
- **Do** honour Reduce Motion: movement collapses to an instant change.
- **Do** use `showPlatformAlert` for a question or notice, and adaptive switches.

### Don't:

- **Don't** colour a selected control, a spinner or a caret with the emergency red.
- **Don't** add a coloured stripe down the edge of a row, message or banner.
- **Don't** use a font from the overused list, or one that draws I and l alike for the
  elder.
- **Don't** put a card, a gradient, glass or a decorative shadow on a working screen.
- **Don't** show a bare spinner where a sentence could say what is happening.
- **Don't** add new uses of the red filled button for actions that are not emergencies
  while the app's filled-button colour is under review.
