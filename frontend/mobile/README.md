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
# Android emulator. 10.0.2.2 is how the emulator reaches the host machine.
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1

# iOS Simulator, which shares the Mac's own network.
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

`localhost` inside the Android emulator is the emulator itself, not the Mac. That is
the first thing that goes wrong for everybody, so the address is passed explicitly
rather than defaulted to something that works on only one of the two.

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
| `lib/features/auth/` | Sign-in |
| `lib/features/elder/` | The panic screen, its controller, and the panic control |
| `lib/features/responder/` | The alert list and detail screens, their controllers, the call button and state pill |
| `lib/core/api/` | The HTTP client and the response models |
| `lib/core/auth/` | Who is signed in, and where the session is kept |
| `lib/core/theme/` | The theme, built from the design tokens |
| `lib/core/widgets/` | Shared pieces: the notice banner and the sign-out button |

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
