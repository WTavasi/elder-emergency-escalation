# Running the Flutter app

The app for elders, caregivers, family, responders and volunteers. It needs the API running first.

Only on the Mac. Everything here needs the Flutter toolchain, which is not available
from anywhere else in this project.

## Step 1. Have the API running

Steps 1 to 4 of [the terminal guide](terminal.md), or the tasks in [the VS Code guide](vscode.md). The app is useless without them, and
the failure it shows you is a network error rather than anything informative.

## Step 2. Pick where it will run

```bash
cd ~/Desktop/Mzazicare/frontend/mobile
flutter devices
```

That lists the simulators and any phone plugged in. If nothing useful appears, open the
iOS Simulator from Spotlight, or Android Studio's Device Manager, and start one.

## Step 3. Run it

```bash
flutter run
```

On the **Android emulator** and the **iOS Simulator** this works with no arguments.
The app picks the Mac's address for the device it is on: `http://10.0.2.2:3000/api/v1`
on the Android emulator, which is how it reaches the machine it runs on, and
`http://localhost:3000/api/v1` on the iOS Simulator, which shares the Mac's network.

On a **real phone**, the phone has to reach your Mac over the same Wi-Fi, so use the
Mac's address on the network. Find it with `ipconfig getifaddr en0`, then:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.42:3000/api/v1
```

substituting whatever that command printed. Both devices must be on the same network,
and a captive or guest network will usually block this.

## Step 4. Sign in

Any seeded account, password `Dev!2026`. Which screen you get is decided by the role:

| Phone | Who | What you see |
| --- | --- | --- |
| `+254700000010` | Grace Wanjiru, elder | The panic control, at the larger type scale |
| `+254700000020` | Mary Otieno, caregiver, tier one for Grace | The alert list and the four actions |
| `+254700000030` | Aisha Wanjiru, family, tier two for Grace | The same list |
| `+254700000040` | Kileleshwa Response Unit, the default emergency responder | The same list |
| `+254700000001` | administrator | A note sending you to the web console |
| `+254700000050` | Daniel Ochieng, community volunteer, approved, near Grace | Nearby: who near him needs help |
| `+254700000051` | Faith Akinyi, community volunteer, waiting for approval | Nearby: "Thank you for applying" |

The seed makes more people around them, so the lists look like a real caseload. All sign
in the same way:

| Phone | Who |
| --- | --- |
| `+254700000012` | Samuel Wanjiru, elder, Grace's husband, at the same home |
| `+254700000011`, `13` | Joseph and Hannah Kimani, elders, a couple in Westlands |
| `+254700000014` | Esther Muthoni, elder, Lavington |
| `+254700000015` | Francis Odhiambo, elder, Kilimani |
| `+254700000016` | Ali Hassan, elder, Kilimani |
| `+254700000021` | Peter Mwangi, caregiver for Joseph and Hannah |
| `+254700000022` | Caroline Wafula, caregiver for Ali |
| `+254700000032` | Brian Wanjiru, family, beside Aisha for both Grace and Samuel |
| `+254700000031`, `33` | David and Wanjiku Kimani, family for both Joseph and Hannah |
| `+254700000034`, `35` | Kevin and Lucy Muthoni, family for Esther |
| `+254700000036`, `37` | Achieng Odhiambo for Francis, and Amina Hassan for Ali |
| `+254700000052` to `54` | Mercy Wairimu, Omar Abdi and Joyce Chebet, volunteers waiting for approval |

Mary looks after four elders within about two kilometres: Grace, Samuel, Esther and
Francis. Where a family has two people, both are at tier two and both are asked at the
same moment, so an alert of Grace's reaches Aisha and Brian together once Mary has not
answered.

The phone field has a country button in front of it, set to Kenya, so `0700000010`,
`700000010` and `+254700000010` all sign in as Grace.

Mary at tier one is the account to use when testing acknowledge and decline, because she
is the one the first dispatch actually asks. An account that was not asked gets a 403
from decline, which is the system working rather than a fault.

Raising an alert from the elder account and watching it appear on the dashboard board is
the quickest end-to-end check that everything is wired together.

Note that the app never asks for location permission, and never sends a coordinate.
Where an emergency is happening is resolved by the server from the elder's own record.

**Forgot your password?**, under the password once you have pressed **Continue** on the
sign-in screen, resets one with a code sent by SMS.
In development the code is in the API's terminal, on a line ending `password reset code`.
Try it on an account you made yourself rather than a seeded one, or set the seeded
password back to `Dev!2026` afterwards.

## Step 5. Try signing up

**Create an account** on the sign-in screen makes a caregiver or family account. In
development nothing is really sent by SMS: the code is written to the API's terminal, in a
line like this one, so watch the window running `npm run dev`:

```
[LoggingSmsProvider] SMS to +254***78: 123456 is your MzaziCare code. It expires in 10 minutes.
```

Use a number no seeded account has, for example `0712 345 678`. Once signed in, the people
icon on the alert list opens **People I look after**, where a caregiver can register an
elder (another unused number, with its own code in the same terminal) and add a family
member by phone. Finding the elder's home searches OpenStreetMap, so it needs an internet
connection on the machine running the API.

## Hot reload

While `flutter run` is attached, **r** reloads changed Dart, **R** restarts the app, and
**q** quits. Changes to `pubspec.yaml` or to anything native need a full **q** and
`flutter run` again.

## Live updates

Once signed in, the app opens a socket to the API's `/realtime` namespace on the same
address it uses for everything else, so there is nothing to configure. A screen showing
an emergency changes within a second of somebody acting on it, on the phone and on the
console alike. The screens still poll behind the socket, every 30 seconds while it is
up and at their old pace (5 to 10 seconds) when it is not, so a dropped connection
makes the app slower, never wrong.

[Back to running the system](../README.md)
