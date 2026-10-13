# MzaziCare mobile

The elder-facing app, and later the caregiver and responder screens.

## Prerequisites

Flutter, plus **CocoaPods for the iOS build only**: `brew install cocoapods`. Several
plugins ship native iOS code, and Flutter uses CocoaPods to build it. Android needs
none of this.

## Running it

The app is a client. The API has to be running first, from the repository root:

```bash
docker compose up -d
npm run dev
```

Then, from `frontend/mobile`:

```bash
flutter run
```

On a simulator or emulator nothing else is needed: the app picks the Mac's address for
the device it is running on. The Android emulator reaches the Mac at `10.0.2.2`,
because `localhost` there is the emulator itself, and the iOS Simulator shares the
Mac's network, so it uses `localhost`. Passing an address overrides that:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

A real phone always needs one; see below. If sign in says it could not reach
MzaziCare, a debug build names the address it tried, which is nearly always the
problem.

VS Code has both as run configurations: **Mobile: Android emulator** and
**Mobile: iOS Simulator** in the Run and Debug panel.

Sign in as the seeded elder, `+254700000010`, password `Dev!2026`.

## Plain HTTP in development

Android blocks cleartext HTTP and iOS refuses it under App Transport Security, and the
development API is plain HTTP on the host machine.

Android is handled in `android/app/src/debug/AndroidManifest.xml`, which applies to the
debug build only, so a release build keeps the default and cannot talk to an
unencrypted server even if somebody points it at one. iOS uses `NSAllowsLocalNetworking`
in `Info.plist`, which permits local addresses only rather than opening the app to
arbitrary unencrypted traffic.

## On a real phone

A phone is not on `localhost` and not on `10.0.2.2`. It reaches the development
machine over Wi-Fi, so it needs that machine's address on the network:

```bash
ipconfig getifaddr en0                       # the Mac's Wi-Fi address
flutter run --dart-define=API_BASE_URL=http://<that address>:3000/api/v1
```

Both devices must be on the same Wi-Fi. Before blaming the app, open
`http://<that address>:3000/health` in the phone's own browser: if that returns JSON,
the network path is fine and anything still failing is the app.

Android needs developer options and USB debugging switched on, and nothing else. An
iPhone additionally needs a signing team in Xcode, Developer Mode enabled on the
device, and CocoaPods installed on the Mac, and its seven day provisioning expiry means
the app stops opening after a week until it is installed again.

## What is built

**The elder.** One screen with four states rather than four screens, because
navigation is one more thing to understand at the worst possible moment: the thing the
elder pressed is replaced, in place, by what happened next.

1. **Idle.** The panic control and nothing else competing with it.
2. **Cancellable.** Ten seconds to withdraw, with the count set large in the
   monospaced face so a changing digit does not move the ones beside it.
3. **Live.** Help is coming, with three large steps ticked off as they happen: sent,
   the people who look after them told, and who is coming once somebody acknowledges.
4. **Finished.** Cancelled or closed, with a way back to the button.

**Signing up.** Caregivers and family members create their own account from the
sign-in screen, with a code sent to their phone. A caregiver then registers the elder
they look after from **People I look after** (the people icon on the alert list),
finding the elder's home by address search, and adds family by phone number. Every phone
field has a country button, Kenya to begin with, and accepts the number however it is
typed.

**A forgotten password.** **Forgot your password?** on the sign-in screen sends a code to
the phone on the account and sets a new password with it, then signs straight in. The
number already typed on the sign-in screen is carried over.

**Before sign-in.** The sign-in and reset screens use the elder's type sizes, because an
elder may be the one signing in, but regular-weight body text: bold everywhere is kept
for an account known to be an elder's (`AppAudience.welcome` in the theme). Sign-up uses
the caregiver's type, since elders never sign up themselves. All three draw the same
background, rings spreading from one corner (`lib/core/widgets/care_rings.dart`), with
everything that has to be read on a card above it.

**Looking after an elder.** Tapping an elder in **People I look after** opens their page:
a call button, where they are now (with a way to record a stay elsewhere and to mark them
back home), their home, how much help they need, and their chain in order. A caregiver
can change the home and care level, remove a family member, or withdraw an invitation
nobody has taken up yet; family members see the same page without those controls.

**My account.** The person icon on the alert list opens it: change your name and email,
and change your password. Changing the password signs out every other phone the account
is signed in on.

**Caregivers, family members and responders.** An Open view of the emergencies they
are part of, and a History view grouped by day. For each one: who is being asked,
where the elder is with a Get directions button that opens the phone's maps app,
calling the elder or a responder, and taking it on, declining or closing it with an
outcome.

## Where things live

Each part of the app is a folder under `lib/features/`; anything more than one part
uses is under `lib/core/`. To change a screen, start in its feature folder.

| Folder | What is in it |
| --- | --- |
| `lib/features/auth/` | Sign-in, sign-up and a forgotten password |
| `lib/features/elders/` | People I look after: registering an elder, their page and chain, adding and removing family |
| `lib/features/profile/` | My account: name, email and password |
| `lib/features/elder/` | The panic screen, its controller, and the panic control |
| `lib/features/responder/` | The alert list and detail screens, their controllers, the call button and state pill |
| `lib/core/api/` | The HTTP client and the response models |
| `lib/core/phone/` | The phone field, its country list and reading a typed number |
| `lib/core/auth/` | Who is signed in, and where the session is kept |
| `lib/core/theme/` | The theme, built from the design tokens |
| `lib/core/widgets/` | Shared pieces: the notice banner, the sign-out button and the sign-in background |

`main.dart` starts the app and registers the font licences; `app.dart` chooses the
screen for the signed-in role. Tests are in `test/`, one file per controller or screen.

## Design

Every colour, type size, spacing step, radius and duration comes from
`frontend/design-tokens`, consumed as a Dart package. There is no literal anywhere in the
theme, because a hard-coded value is the one thing the contrast gate cannot check.

The type and touch scale follows the role rather than a setting. An elder-facing screen
is built to `MzaziA11y.elderMinBodySize` and `MzaziA11y.elderMinTouchTarget` because of
who is using it, and a caregiver's alert list would be unusable at 22pt body text.

## Tests

```bash
flutter test
```

They cover the three things that would fail quietly:

- **One press is one emergency.** Three presses in the same instant, which is what a
  frightened person actually does, raise exactly one.
- **A refused request leaves the control pressable.** The worst moment to strand
  somebody with nothing to press is immediately after a failed call for help.
- **The accessibility floors**, asserted against the token constants rather than
  against numbers typed in the test, so lowering a floor in `tokens.json` fails a test
  instead of passing a review.

## Location

The app never reads the device's location. The server places each alert itself: where
the elder is staying, if their care circle has recorded a stay away from home, and
otherwise their registered home. The away-from-home severity factor therefore scores
only when a stay has been recorded. Listening for a spoken keyword is noted as future
work in `docs/decisions.md`, not built.
