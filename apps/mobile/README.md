# MzaziCare mobile

The elder-facing app, and later the caregiver and responder screens.

## Running it

The app is a client. The API has to be running first, from the repository root:

```bash
docker compose up -d
npm run dev
```

Then, from `apps/mobile`:

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

## What is built

The elder path. One screen with four states rather than four screens, because
navigation is one more thing to understand at the worst possible moment: the thing the
elder pressed is replaced, in place, by what happened next.

1. **Idle.** The panic control and nothing else competing with it.
2. **Cancellable.** Ten seconds to withdraw, with the count set large in the
   monospaced face so a changing digit does not move the ones beside it.
3. **Live.** Help is coming, and the caregiver's name once somebody acknowledges.
4. **Finished.** Cancelled or closed, with a way back to the button.

The caregiver, family and responder screens are not built. An account with one of those
roles is told so rather than shown an empty app.

## Design

Every colour, type size, spacing step, radius and duration comes from
`packages/tokens`, consumed as a Dart package. There is no literal anywhere in the
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

## Known limitation

Alerts report the elder's registered home rather than the device's location. The device
location arrives with the permission flow, behind a seam that is one line to swap.
Until then the severity policy's away-from-home factor scores 0 on every alert raised
from this app, so do not present that factor as working in a demonstration.
