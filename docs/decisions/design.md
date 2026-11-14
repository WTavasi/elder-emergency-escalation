# Decisions: Design of the app and the console

Colour, type, wording and the conventions each screen follows.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## Colour is defined once

`frontend/design-tokens/tokens.json` is the only place a colour exists. Every consumer reads a
generated file, and the generator recomputes every declared WCAG pair and exits non-zero
if one regresses, so an inaccessible palette fails CI rather than shipping.

A hard-coded hex anywhere in an app is the one value that gate cannot check, which is
why there are none.

## The fonts are bundled, and the elder's was chosen for legibility first

The app no longer bundles fonts. Since 26 October 2026 it uses the phone's own face; see
"The app follows Apple's conventions, and Elder mode is a switch" below. The console still
self-hosts its faces as described here.

Before this the token file named IBM Plex Sans and Archivo and no font file existed in the
repository. Both surfaces asked for faces that were never loaded and fell back to the
platform default, so the app rendered in San Francisco on iOS and Roboto on Android. The
design language described type that the product never showed.

Three faces now ship with the build:

**Inclusive Sans for the elder path.** Designed by Olivia King for accessibility and
readability. A capital I, a lowercase l and a 1 cannot be mistaken for one another, and the
zero is slashed, so O and 0 differ too. For an interface an older person reads under stress,
that property is worth more than any amount of visual character. Weight 700 throughout,
which is a reading decision and therefore a token rather than a per-widget choice.

**Source Sans 3 for everybody else**, as one variable file covering 200 to 900. Smaller
than three static weights would be, and it means headings are separated from body text by
weight rather than by a fourth family.

**Atkinson Hyperlegible Mono for figures**, where digits have to line up: the countdown,
phone numbers, codes. The Braille Institute's monospace, from the same low-vision research
as Atkinson Hyperlegible, with a slashed zero.

The elder face was Atkinson Hyperlegible until 25 October 2026, and the figures were IBM
Plex Mono. Atkinson was the more defensible choice on paper, being drawn for low vision with
published research behind it, but it read as plain and slightly dated. Five faces were set
side by side at the elder's real sizes: Atkinson Hyperlegible, its 2025 successor Atkinson
Hyperlegible Next, Lexend, Inclusive Sans and Andika. The test was the help button, a
bold 22pt sentence, and the letters most often confused. Every caregiver-side candidate
tried at the same time (Figtree, Red Hat Text, Public Sans, Onest, Hanken Grotesk) drew
I and l identically, which ruled them out for the elder. Lexend sets wider, so the
elder's lines wrap sooner, and Andika's bold is weak. Inclusive Sans kept every distinction
that mattered and was the most appealing to read, so it replaced Atkinson. The trade is
stated plainly: it is designed for legibility but has less published research behind it
than Atkinson. None of the faces is on the list of overused interface fonts that the
impeccable design guidance asks projects to avoid.

One consequence of the change: the old elder face came in only regular and bold, so the
theme's semi-bold step rendered bold on its own. Inclusive Sans has a real 600, which put
buttons and labels lighter than the bold sentence beside them. On the large-type screens
the step above body is therefore bold, set in the theme rather than per widget.

Bundled and self-hosted rather than fetched. The console displays an elder's name and
address, so it makes no third-party request at all, and the API's content security policy
would refuse one. The cost is about a megabyte in the app, which for an emergency
application is the right trade: it means the elder screen's legibility is a property of a
decision rather than of whatever the phone happens to have installed.

Two implementation notes that were not obvious. All three faces are variable fonts, which
carry weight as an axis rather than as separate files, so the theme sets `fontVariations`
as well as `fontWeight`; setting only the latter leaves the axis at its default and every
weight renders the same. Anywhere else a weight changes, it goes through the theme's
`weighted()` rather than `copyWith(fontWeight:)`, for the same reason.
And the licence text is bundled as an asset and registered with Flutter's licence page,
because bundling a font is distributing it and the Open Font Licence requires the licence
to travel with it.

## Light or dark is the person's choice, and the emergency colours are not

The app followed the phone's setting and nothing else. That stays the default, but it
is one setting for every app, and an older person may read one mode more easily in this
app alone, or have the phone set up by somebody who prefers the other. So every account
page has **Screen**: Same as this phone, Light or Dark. It is kept on the phone rather
than the account, because it is about the screen in front of them.

What does not change with the mode is what an emergency looks like. The brand red is
about 2:1 against the dark page, under the 3:1 a control's outline needs, so in dark
mode the help button carries a brighter red edge, gated against the page. The countdown
is the same yellow in both modes, with the same dark ink.

## The app follows Apple's conventions, and Elder mode is a switch

Most people who use the app do so on an iPhone, and the app looked like a web page placed
inside one: its own fonts, square buttons, centred dialogs, and a sign-in form floating
high on a blank screen. On 26 October 2026 it was reworked to follow Apple's Human
Interface Guidelines, and to avoid the habits that make an interface look generated.

**The phone's own face, on Apple's scale.** SF Pro on an iPhone and Roboto on Android,
at Apple's default sizes (body 17, large title 34) and following the phone's text-size
setting. Nothing is bundled, which also removes about a megabyte and the licence
registration. The cost is stated plainly: the elder's previous face, Inclusive Sans, was
chosen because a capital I, a lowercase l and a 1 could not be confused and the zero was
slashed. SF Pro draws I and l more alike. What carries the meaning on an elder's screen is
words and context rather than a code to be read letter by letter, and codes and numbers
are digits, which SF Pro keeps distinct; against that, the face every other app on the
phone uses is the one the elder already reads every day. The console kept Source Sans 3
and Atkinson Hyperlegible Mono until it followed on 29 October 2026 (below).

**One face for everybody, and Elder mode for size.** Before, the elder had a different
face from everybody else. Now everybody has the same face, and Elder mode makes it larger
(body 22, semibold) with taller buttons (72 points). It starts on for an elder's account
and off for everybody else, and anybody can switch it from their own page: a caregiver
with poor eyesight wants it, and an elder who reads well may not. The choice is kept on
the phone, not the account, because it is about the person holding that phone, and it
holds before sign-in so an elder's phone stays large on the sign-in screen. Screens take
their sizes from the theme rather than asking whose account it is, so the switch reaches
everything.

**The way in has MzaziCare's red across the top**, with the care rings faint in white and
a curved lower edge, and the form low on the screen where the thumb is. The red fills the
space a short form would leave empty. It is the one place the red is used as a mark
rather than a state, and it can be, because no emergency can be on screen before sign-in.

**Buttons are solid with rounded corners**, full width, 50 points tall: the main action in
red, the secondary one ink on grey with no outline, links in red without an underline, as
an iPhone app's links take its tint. Red on actions that are not emergencies was already
under review for the filled button, and the links join that review.

**Every question is a sheet from the bottom**, not a dialog in the middle: a grab handle, a
title, a sentence saying what will happen, then the answers as rows with icons, the way out
last. It sits where the thumb is and is dismissed by swiping down, as on iPhone. The
answer a question leads to can be a full-width button.

**Permission is asked at the moment of need, after saying why.** The location retry on an
emergency ("Try sharing again") only checked whether the phone allowed location, and never
asked. On an iPhone a permission that has not been asked yet, or an "Allow Once" that has
expired, reads as refused, so the retry could never succeed: a caregiver who had not been
asked could not share their way there at all. Now pressing it says why in a sheet with one
button, Continue, and then the phone asks. Apple recommends both halves: ask in context,
and explain before the system's question, because a refusal there can only be undone in
Settings.

Smaller changes in the same pass: what has happened on an emergency is numbered on a line,
as the console draws the chain; the swipe to confirm fills behind its knob and fades its
words so they are never read through it; the elder's own page has the same parts in the
same order as everybody else's, with privacy and terms in a part of their own; and the
change-password form asks for the new password once, with a way to show it, rather than
twice.

## The console follows a Mac app, as the app follows an iPhone one

Once the app followed Apple's conventions, the console was the odd one out: its own fonts,
a breadcrumb bar repeating each page's title, spreadsheet-like tables with an Apply
button, dialogs centred with a close cross, and ink buttons where the app's were red. On
29 October 2026 it was reworked after Mail and System Settings, with four choices made by
the project's owner: the computer's own face, MzaziCare red for actions as in the app, a
sign-in like the app's, and a density close to a Mac's rather than a phone's.

**The computer's own face, on Apple's Mac scale.** `system-ui`: SF Pro on a Mac, Segoe UI
on Windows. Source Sans 3 and Atkinson Hyperlegible Mono are gone, and with them about
700 KB of fonts and two licence files. Figures keep a fixed width with tabular digits
rather than a monospaced face, which also ends odd spacing such as "1 . 5 km". Sizes take
Apple's steps a little below the phone's (body 15, large title 28), because the console is
read at a desk and holds many records at once. What was given up: Atkinson Hyperlegible
Mono told 0 from O and 1 from l at a glance, which mattered for phone numbers. In the
console those are always read in a column of other phone numbers, where the shape of the
digits is enough; nothing there is typed back from the screen. The tokens lose the font
names and the old console scale (`type.standard`), gain `type.family.system`,
`type.console` and `radius.control`, and the app's generated Dart loses the two classes
nothing read.

**Red actions, under review with the app's.** The filled button and links take MzaziCare
red, as the app's do, so the two surfaces read as one product. This adds red that does not
mean an emergency to a second surface, so it joins the app's review rather than
settling it; the governing rule in `docs/design-language.md` records both exceptions. The
sidebar's selection is grey, not red, because a page being open is not an emergency.

**A window frame.** A grey sidebar with each section's count and the account at its foot,
which can be hidden; on each page a bar that holds its actions and, once the large title
has scrolled away, the page's name. The browser tab carries the number nobody has
answered, so a console left in a background tab still says somebody is needed.

**Lists, not spreadsheets.** A whole row opens its record, with a chevron to say so, and
an emergency nobody has answered is marked by a red dot before the name, as an unread
message is in Mail, rather than by a coloured row. The Users table lost its Status column,
because nearly every account is active, and says "Deactivated" beside the exception
instead; it gained the size of each elder's chain. Choosing several users is behind a
Select button, as in Photos, so the checkboxes are not in the way the rest of the time.

**Filters apply as they are chosen**, as they do in Finder and Mail, and the date filter
offers the ranges a person usually means (today, this week, this month) before a range of
their own. The Apply button was a form's habit, not a tool's.

**Sheets, not dialogs.** A question drops from the top of the window with its buttons at
the bottom right, the one that goes ahead last; a form's labels sit right-aligned to the
left of the fields; a choice between a few things is a segmented control.

**What happened is told in sentences.** An emergency's record used to list audit actions
("Tier dispatched", "+12s", "system"). It now uses the app's sentences ("Sent to Aisha
Wanjiru and Brian Wanjiru", "12 seconds after the alert"), with two more that only an administrator
needs: how the emergency was scored, and a message that could not be delivered and why.
The delivery attempts are under a disclosure, because they explain the sentences rather
than tell the story.

Smaller changes in the same pass: "Updated just now" and a refresh button in place of a
Live dot and a full Refresh button; times on the live board as "4 min ago", with the exact
time on hover; up and down arrows and Return to move through and open rows; Command-F to
the search on History and Users; the reporting figures drawn as Health draws them; and the
sign-in as a red panel with the care rings beside the form, as the app's way in is red
across the top.

## The app speaks in short, plain sentences

The app's wording was correct but did not sound like a real app. It avoided
contractions ("I am all right, stop this"), leaned on the passive ("Your family has been
told"), used the system's own words (tier, escalated, acknowledged, vetted) and ran
sentences long. On 2 November 2026 every screen, sheet and error, and every push and
text the server sends, was rewritten to the rules now under Wording in
`docs/design-language.md`: short sentences, the action first, MzaziCare speaking as "we",
simple words for somebody reading in a second language, and no promise the product
cannot keep.

Four changes go beyond style:

- **Nothing promises help before anybody has answered.** The countdown said "Help is on
  the way" the moment the button was pressed, and the waiting screen said "Someone will
  call you". It now says "Alert sent" and "We've told your family", and asks the elder to
  keep their phone near them.
- **"Call an emergency responder" is now "Ask for an emergency responder".** It sends a
  request through MzaziCare and rings nobody, so a carer who pressed it could wait for a
  phone that never rang.
- **The states and the middle severity band have everyday names**, in the app and the
  console alike: On the way, Help is there, Moved on and Cancelled for Being handled,
  Help arrived, Escalated and Withdrawn; High for Elevated. The stored values are
  unchanged.
- **"Share my way there" is "Share live location"**, the name people already know.

Negatives are written out (cannot, do not) while positive contractions are used, because
"can't" read in a hurry is easily taken for "can". Nothing is set in bold inside a
sentence: Elder mode carries the size and weight. The privacy notice and terms keep their
full sentences, and still name the old "Share my way there" until they are next revised.

## Rounded groups, the important part first, and buttons that look pressable

The caregiver's page for an emergency had grown to a dozen sections, several of them rows
that expanded in place, so what to do next was below the fold and mixed with history.

**Rounded groups on a grey page.** Rows now sit in white groups with rounded corners,
inset by the page margin, as Settings and Health set them out, in place of lists running
edge to edge under a label and a rule. A group's edge says where a section starts and
ends, which a rule under a label did less clearly. Each row stays its own stop for a
screen reader.

**What to act on first, the rest one tap away.** The emergency page opens with its state
(who is being asked, who is coming), then a warning when the elder's health makes it more
serious, then what is happening now (the way, the services, the volunteer, talking to
the elder), then the latest thing the elder said, then where they are, then the medical
summary. The full trail, the whole chain and everything the elder said are rows that open
a page of their own, as the full medical record already did. Nothing a caregiver needs to
act on is behind a row that expands.

**Buttons look like buttons.** Text buttons were red words, which read as part of a
sentence and added red that does not mean an emergency. They are now a smaller grey pill,
ink on the sunk grey, in the app and in the console's quiet buttons and in-text actions.
On the yellow countdown, where grey would not show, they are an ink outline. The red
filled button stays under review, as before; red links leave that review because there
are none.

The same layout was carried to the elder's page (a contact card: call, where they are,
details, who is asked, the check-in, care and privacy), the people list, the alerts list
(with a segmented control for open and past alerts), the consent pages and the
volunteer's nearby list.

## The console is live again, collapses to a rail, and the app's long pages stop jumping

Changed on 9 November 2026 after using the console and the app.

**The board is live, and says so.** The Mac-style pass had replaced the "Live" dot with
"Updated just now" and a refresh button, which made a live screen look like one to keep
refreshing, and it hid a real fault: a new emergency only appeared after a refresh. The
board decided whether to fetch again inside a React state updater, which React runs later,
so the decision was always "no". It now reads the board as it stands when the message
arrives, and a new emergency appears at once (87 ms in a browser), sliding in with a
brief glow; a closed one leaves at once. The "Live" dot is back. The connection keeps
retrying by itself after a drop, and the board is fetched again when it returns, because
what happened in between was never sent. Every 30 seconds the console also asks the
server's `/health`, so a lost database or Redis shows as "Service problem: Redis down"
even while the connection stays up.

**`/health` could hang.** With Redis down, its client queues commands rather than failing
them, so the health check never answered. Each dependency now has 2 seconds, and a 503
carries the report, so whatever watches it hears which part is down.

**The sidebar collapses to a rail.** Its button now narrows it to the icons, with each
section's name kept for a screen reader and shown on hover, and the open count on its
icon, instead of hiding it entirely. The choice is remembered on that browser.

**The app's long pages stop jumping.** A lazily built list guesses the height of the
sections it has not built from those it has. On Me, where sections differ a lot in height,
the guess moved as the page scrolled (918, 834, 700, 929 points while the real height was
700), and when it fell below where the page already was, an iPhone's bounce pulled it back
up. The pages made of sections (Me, the elder's own Me, an elder's page, an emergency,
medical details, consent, volunteering) now build every section, which costs nothing at
their length, so the height is always known. Long lists of similar rows keep the default.
