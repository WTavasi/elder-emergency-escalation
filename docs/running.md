# Running the system

Two guides for the same thing. The first uses a plain terminal, the second uses VS
Code, where the commands are already defined as tasks. Use whichever you prefer; they
start the same processes.

Start here if you have just turned the laptop on.

## What has to be running

Four things, in this order. Each one depends on the ones above it.

| | What | Where it ends up |
| --- | --- | --- |
| 1 | Docker Desktop | menu bar, says "Engine running" |
| 2 | Postgres and Redis containers | ports 5433 and 6379 |
| 3 | The API | http://localhost:3000 |
| 4 | The dashboard | http://localhost:5173 |
| 5 | The Flutter app, when you want it | a simulator or a connected phone |

Steps 1 to 4 are the system. Step 5 is optional: the dashboard alone is enough to watch
an escalation, and the app is what you start when you want to raise one by hand or work
on a screen. It is Guide C below, and it needs the API already running.

---

## Guide A: the regular terminal

### Step 1. Start Docker Desktop

Open it from Applications, or press Cmd + Space, type `Docker`, press Enter.

Wait for the whale icon in the menu bar to stop animating. Click it and check the menu
says **Engine running**. Nothing below this step works until it does. This usually
takes twenty to forty seconds from cold.

### Step 2. Open a terminal and go to the project

Press Cmd + Space, type `Terminal`, press Enter.

```bash
cd ~/Desktop/Mzazicare
```

Check you are in the right place. This should print the project path and list `apps`,
`packages` and `docker-compose.yml` among other things:

```bash
pwd && ls
```

### Step 3. Start Postgres and Redis

```bash
docker compose up -d
```

`-d` means detached, so it returns your prompt rather than filling the terminal with
logs. Now wait for both to report healthy:

```bash
docker compose ps
```

Repeat that until the STATUS column says `healthy` for both rather than `starting`,
which takes about fifteen seconds. The PORTS column should read:

```
mzazicare-postgres   0.0.0.0:5433->5432/tcp
mzazicare-redis      0.0.0.0:6379->6379/tcp
```

The left number for Postgres must be **5433**, because 5432 is taken by a Homebrew
Postgres on this machine. If it says 5432, see Troubleshooting below.

### Step 4. Start the API

Still in the same terminal:

```bash
npm run dev
```

This one does not finish. It compiles and then watches for changes. Wait for the
startup lines to stop and for a line naming the port:

```
[NestApplication] Nest application successfully started
Listening on http://localhost:3000
```

Leave this terminal alone from now on. It is where the API's logs appear, and it is
where you will see an escalation happening.

### Step 5. Start the dashboard

Open a **second** terminal tab with Cmd + T. A new tab starts in your home folder, so
move to the project again:

```bash
cd ~/Desktop/Mzazicare
npm run dev:dashboard
```

Wait for:

```
VITE ready in 400 ms
➜  Local:   http://localhost:5173/
```

### Step 6. Open it

Cmd-click the `http://localhost:5173/` link, or open a browser and go there yourself.

Sign in with the seeded administrator account:

- Phone: `+254700000001`
- Password: `Dev!2026`

Or choose **Email** above the field and use `admin@mzazicare.example` with the same
password. A **Sign in with Google** button appears too, once Google sign-in is set up as
described under [Google sign-in on the console](#google-sign-in-on-the-console).

You should land on the open emergencies board. If nothing is open, the board says so,
which is the state the system should usually be in.

### Shutting down

Press **Ctrl + C** in each of the two terminals. Then, if you want the databases
stopped too:

```bash
docker compose down
```

Use `down` and never `down -v`. The `-v` deletes the data volumes, which means
re-running the migrations and the seed next time.

---

## Guide B: VS Code

This does the same thing in one window, with each process in its own pane.

### Step 1. Start Docker Desktop

Exactly as in Guide A. VS Code cannot do this for you.

### Step 2. Open the project

Open VS Code, then **File > Open Folder**, and choose `~/Desktop/Mzazicare`.

Open the folder itself, not `backend` or any subfolder. The tooling resolves from the
repository root, and opening a subfolder gives you type errors that do not exist and
tasks that are not there.

The first time you open it, VS Code shows a notification offering the recommended
extensions. Accept it. If you miss the notification, click the Extensions icon in the
left bar and type `@recommended` into the search box.

### Step 3. Run the tasks

Press **Shift + Cmd + P**, type `Run Task`, press Enter. Pick these in order, coming
back to the same menu each time:

1. **Services: start** — brings up Postgres and Redis. This finishes on its own.
2. **API: run** — opens a dedicated pane and keeps running.
3. **Dashboard: run** — opens another pane and keeps running.

Each task opens its own terminal pane, so you can see all three at once by clicking
between them in the terminal panel's dropdown on the right.

### Step 4. Open it

In the Dashboard pane, Cmd-click the `http://localhost:5173/` link. Sign in as above.

### Shutting down

Click the bin icon on each running terminal pane, or press Ctrl + C in each. Then run
the **Services: stop** task.

---

## Guide C: the Flutter app

Only on the Mac. Everything here needs the Flutter toolchain, which is not available
from anywhere else in this project.

### Step 1. Have the API running

Steps 1 to 4 of Guide A, or the tasks in Guide B. The app is useless without them, and
the failure it shows you is a network error rather than anything informative.

### Step 2. Pick where it will run

```bash
cd ~/Desktop/Mzazicare/frontend/mobile
flutter devices
```

That lists the simulators and any phone plugged in. If nothing useful appears, open the
iOS Simulator from Spotlight, or Android Studio's Device Manager, and start one.

### Step 3. Run it

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

### Step 4. Sign in

Any seeded account, password `Dev!2026`. Which screen you get is decided by the role:

| Phone | Who | What you see |
| --- | --- | --- |
| `+254700000010` | Grace Wanjiru, elder | The panic control, at the larger type scale |
| `+254700000020` | Mary Otieno, caregiver, tier one for Grace | The alert list and the four actions |
| `+254700000030` | family member, tier two for Grace | The same list |
| `+254700000040` | emergency responder, tier three | The same list |
| `+254700000001` | administrator | A note sending you to the web console |

The phone field has a country button in front of it, set to Kenya, so `0700000010`,
`700000010` and `+254700000010` all sign in as Grace.

Mary at tier one is the account to use when testing acknowledge and decline, because she
is the one the first dispatch actually asks. An account that was not asked gets a 403
from decline, which is the system working rather than a fault.

Raising an alert from the elder account and watching it appear on the dashboard board is
the quickest end-to-end check that everything is wired together.

Note that the app never asks for location permission, and never sends a coordinate.
Where an emergency is happening is resolved by the server from the elder's own record.


**Forgot your password?** under the sign-in button resets one with a code sent by SMS.
In development the code is in the API's terminal, on a line ending `password reset code`.
Try it on an account you made yourself rather than a seeded one, or set the seeded
password back to `Dev!2026` afterwards.

### Step 5. Try signing up

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

### Hot reload

While `flutter run` is attached, **r** reloads changed Dart, **R** restarts the app, and
**q** quits. Changes to `pubspec.yaml` or to anything native need a full **q** and
`flutter run` again.

### Live updates

Once signed in, the app opens a socket to the API's `/realtime` namespace on the same
address it uses for everything else, so there is nothing to configure. A screen showing
an emergency changes within a second of somebody acting on it, on the phone and on the
console alike. The screens still poll behind the socket, every 30 seconds while it is
up and at their old pace (5 to 10 seconds) when it is not, so a dropped connection
makes the app slower, never wrong.

### Step 6 (optional). Reach the API from anywhere: an ngrok tunnel

A real phone on the same Wi-Fi as the Mac should use the Mac's address, as in Step 3.
The tunnel is for when it cannot: a phone on mobile data, a network that keeps devices
apart, or showing the app to somebody else. It gives the Mac's port 3000 a public
https address.

1. Install it and connect it to your account (free; sign up at ngrok.com first):

   ```bash
   brew install ngrok
   ngrok config add-authtoken <the token from the ngrok dashboard>
   ```

2. On the ngrok dashboard, open **Domains**. The free plan includes one dev domain,
   something like `quiet-owl-1234.ngrok-free.app`. It stays the same every time, so the
   app can be pointed at it once.

3. With the API running (Guide A), start the tunnel in a new terminal tab:

   ```bash
   ngrok http --url=quiet-owl-1234.ngrok-free.app 3000
   ```

4. Run the app against it:

   ```bash
   flutter run --dart-define=API_BASE_URL=https://quiet-owl-1234.ngrok-free.app/api/v1
   ```

   The live updates socket goes through the same tunnel; ngrok carries WebSockets.

Two limits of the free plan matter here. It allows about 20,000 requests a month, and a
phone left open on an alert list spends some of them, so close the app when you are not
testing and prefer the Wi-Fi address when you can. And a browser opening the address
sees an ngrok warning page first; the app is not a browser and never sees it.

For the demonstration the API moves to Render instead, which has no such limits (issues
#78 and #79).

### Step 7 (optional). Push notifications on a phone

Push is what reaches a caregiver whose app is closed. It needs a Firebase project, and
it is off in any build that was not given one: the app then never asks for notification
permission, and everything else works.

1. In the [Firebase console](https://console.firebase.google.com), open the MzaziCare
   project (or create one), then **Project settings**, **Your apps**, and add an
   **Android app** with the package name `ke.ac.strathmore.mzazicare`. Download the
   `google-services.json` it offers into your Downloads folder, and skip the steps about
   editing Gradle: this app reads the same values as build defines instead.

2. Copy the example file and fill it in from the downloaded `google-services.json`:

   ```bash
   cd ~/Desktop/Mzazicare/frontend/mobile
   cp firebase.example.json firebase.local.json
   ```

   | Key | Where it is in `google-services.json` |
   | --- | --- |
   | `FIREBASE_PROJECT_ID` | `project_info.project_id` |
   | `FIREBASE_SENDER_ID` | `project_info.project_number` |
   | `FIREBASE_ANDROID_APP_ID` | `client[0].client_info.mobilesdk_app_id` (`1:...:android:...`) |
   | `FIREBASE_ANDROID_API_KEY` | `client[0].api_key[0].current_key` |
   | `API_BASE_URL` | Not in that file. Optional: the ngrok or Wi-Fi address from above |

   `firebase.local.json` is gitignored, and so is `google-services.json` should it end up
   in `android/app`. Leave the iOS keys empty for now.

3. Run with it:

   ```bash
   flutter run --dart-define-from-file=firebase.local.json
   ```

   After signing in, the phone asks once whether MzaziCare may send notifications, then
   registers itself with the API (`PUT /api/v1/auth/me/push-token`). Signing out removes
   the registration.

4. Start the API with real push, as in docs/testing.md, "With real providers":

   ```bash
   PUSH_PROVIDER=fcm npm run dev
   ```

   The API's service account (`credentials/fcm-service-account.json`) has to belong to
   the same Firebase project as the app, or Firebase refuses every message.

   Raise an alert as Grace from another device or Postman, with Mary signed in on the
   phone and the app in the background. The notification arrives on the
   **Emergencies** channel.

**iOS** needs an APNs key, which needs a paid Apple Developer account, uploaded to
Firebase under Cloud Messaging. Without one, the iOS app runs and simply registers no
push address. Android is enough for the demonstration.

### Step 8 (optional). Share the way there

A caregiver who turns on **Share my way there** and takes an emergency on shares where
they are until they arrive. Grace's phone shows "Mary Otieno is coming" with the minutes
left; anybody else in the circle also gets a "See where Mary is" button. Nobody has to
drive anywhere to try it: both emulators can pretend to move.

You need two sessions: the elder (Grace, `+254700000010`) and the caregiver (Mary,
`+254700000020`). The easiest pair is the Android emulator for Mary and the iOS Simulator
for Grace, or Postman for Grace (folder **2b** raises her alert).

1. **Turn sharing on as Mary.** Sign in as Mary, open **Me**, and switch on **Share my
   way there**. The phone asks for location access; choose **While using the app**, and
   on Android keep **Precise** selected. The switch only stays on once access is
   allowed.

2. **Put Mary 2 km away.** Grace's home in the seed data is Kileleshwa, at
   `-1.2833, 36.7833`. Give Mary's emulator a place a little way off:
   - **Android emulator:** click **⋯** (Extended controls) on the emulator's side bar,
     open **Location**, search for **Westlands, Nairobi** (or type `-1.268, 36.811`),
     and click **Set location**.
   - **iOS Simulator:** in the menu bar, **Features → Location → Custom Location…**, and
     enter latitude `-1.268` and longitude `36.811`.

3. **Raise an alert as Grace**, from her app or with Postman.

4. **Take it on as Mary.** Open the alert and press **I am on my way**. Within a few
   seconds the screen says **About N minutes to Grace**, and Grace's screen moves to
   **Coming** with the same time.

5. **Move Mary closer.** Set the emulator's location to Grace's home, `-1.2833, 36.7833`.
   Within about 12 seconds, inside 100 m, the alert becomes **Help arrived** on its own,
   and sharing stops. To try the manual way instead, swipe **Swipe when you are with
   Grace** at the bottom of Mary's screen before moving her.

   The Android emulator can also play a route: in **Location**, open the **Routes** tab,
   set a start and an end, and press **Play route**. The iOS Simulator's **Features →
   Location → City Run** moves the phone continuously, though around Cupertino rather
   than Nairobi, so the minutes will be large.

While sharing, Android shows a **Sharing your way there** notification and iOS shows the
blue location indicator. Both disappear when sharing stops.

**Real road times.** By default the time is a straight-line estimate. To use real routes,
start the API with the public OSRM router switched on for that run:

```bash
ROUTING_PROVIDER=osrm npm run dev
```

The public server allows one request a second and is for testing only, so leave it off
unless you are looking at the times.

### Step 9 (optional). Answer an alert by text

An alert SMS can end "Reply 1 if you can go, 2 if you cannot", and the reply takes the
alert on or declines it, exactly as the app's buttons do. It is off until the API is
given a secret for the address the replies come to.

**Quickest: without Africa's Talking.** Postman can post a reply the way the gateway
would. Start the API with the secret the Postman environment already holds:

```bash
SMS_INBOUND_TOKEN=local-text-replies-0123456789 npm run dev
```

Then run folder **1. Sign in** and folder **2c. Answering by text**. The texts the
system sends back appear in the API terminal on lines starting `[LoggingSmsProvider]`.

**The real thing: the Africa's Talking sandbox and its phone simulator.** This needs the
ngrok tunnel from Step 6, because Africa's Talking has to reach your Mac.

1. Make a secret for this run, and keep it to hand:

   ```bash
   openssl rand -hex 16
   ```

2. Sign in at [account.africastalking.com](https://account.africastalking.com) and open
   the **Sandbox** app.

3. **Create a shortcode.** In the sandbox, open **SMS**, then **Shortcodes**, then
   **Create Shortcode**. Pick any free number, for example `12345`, and save it.

4. **Point incoming messages at the API.** Still under **SMS**, open **SMS Callback
   URLs**, then **Incoming Messages**, and enter, with your ngrok domain and the secret
   from step 1:

   ```
   https://quiet-owl-1234.ngrok-free.app/api/v1/sms/inbound?token=<the secret>
   ```

5. **Start the API with real SMS, the shortcode and the secret**, all for this run only.
   The sandbox username and API key are read from `backend/.env`, as in
   [testing.md](testing.md):

   ```bash
   SMS_PROVIDER=africastalking AT_SHORTCODE=12345 SMS_INBOUND_TOKEN=<the secret> npm run dev
   ```

   And the tunnel, in another tab: `ngrok http --url=quiet-owl-1234.ngrok-free.app 3000`.

6. **Open the simulator** at
   [simulator.africastalking.com:1517](https://simulator.africastalking.com:1517) and
   launch it with the family member's number, `+254700000030`. That account has no app
   and no push address, so its alerts arrive by SMS.

7. **Raise an alert as Grace** and let it reach tier 2: in the app or Postman, have Mary
   decline it (folder 3 does this). The simulator's **Messages** shows the alert from
   `12345`, ending "Reply 1 if you can go, 2 if you cannot."

8. **Reply 1** in the simulator. Within a few seconds a text comes back with Grace's
   number and address, the alert shows as taken by the family member on the console and
   in Mary's app, and its trail says "by text".

Sending from the shortcode is what makes the reply land in the right place: a person who
answers a message answers the number it came from. Africa's Talking documents the
sandbox and simulator in [How do I get started on the Africa's Talking
Sandbox?](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox).

### Step 10 (optional). Talk to the elder through the app

A responder can press **Talk to Grace** on an alert. Grace's phone, if MzaziCare is open
on it, says "Mary is joining to talk to you", buzzes for three seconds and joins on the
speaker, so an elder who has fallen does not have to reach the phone and answer it. The
audio goes through LiveKit. Nothing is recorded.

**1. Get a LiveKit project (free, once).**

1. Sign up at [cloud.livekit.io](https://cloud.livekit.io) and create a project. The
   free plan includes 5,000 participant-minutes a month and stops at the limit rather
   than charging.
2. In the project, open **Settings**, then **API keys**, and create a key. Copy three
   things: the project URL (it starts `wss://` and ends `.livekit.cloud`), the API key
   and the API secret.
3. Put them in `backend/.env`, which is never committed:

   ```
   LIVEKIT_URL=wss://<your project>.livekit.cloud
   LIVEKIT_API_KEY=<the key>
   LIVEKIT_API_SECRET=<the secret>
   ```

4. Restart the API. Any alert's detail now carries `"voice": { "available": true, ... }`.

**2. Make a call.** Two devices on this Mac work: Grace on the iOS Simulator and Mary on
the Android emulator. Use headphones, or two people in two rooms will whistle at each
other through one Mac's speakers.

1. On the Android emulator, let it hear the Mac's microphone: click **⋯** (Extended
   controls), open **Microphone**, and turn on **Virtual microphone uses host audio
   input**. The iOS Simulator uses the Mac's microphone already.
2. Sign in as Grace on one and Mary on the other. Raise an alert as Grace and wait for
   the countdown to finish.
3. As Mary, open the alert and press **Talk to Grace**. Allow the microphone when asked.
   The call screen says **Waiting for Grace to join**.
4. On Grace's phone: **Mary is joining to talk to you**, three seconds, then **Talking
   with Mary** and a large **End call**. The first time, the phone asks for the
   microphone; allow it.
5. Mary's screen now says **On the call with Grace**, with a timer, mute, speaker and the
   red end button.
6. On the console, the alert's page says Mary started a call, and the timeline shows each
   join.

**Without the internet: a LiveKit server on this Mac.**

```bash
brew install livekit
livekit-server --dev --bind 0.0.0.0
```

and in `backend/.env`, with the Mac's Wi-Fi address from `ipconfig getifaddr en0`:

```
LIVEKIT_URL=ws://<that address>:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

The development server's key and secret are fixed and public, so it is for this Mac only.

**What it does not do yet.** The elder's phone joins by itself only while MzaziCare is
open on it, which it is from the moment help was asked for. A phone that was locked or
had the app closed is reached the old way, by ringing. A conference call over the phone
network (Africa's Talking voice) would cover that case; it needs a purchased voice
number, because Africa's Talking voice does not work in the sandbox, and is written up
as future work.

### Step 11 (optional). A daily check-in

Grace can be asked "are you all right?" at times she chooses or agrees to. If she does
not answer, Mary's chain is alerted as if she had pressed for help, worded as a missed
check-in. Nothing to install: it runs inside the API, on a one-minute clock.

**1. Set one up as Mary.**

1. Sign in as Mary, open **Elders**, then Grace, and scroll to **Daily check-in**.
2. Press **Set up**, turn on **Ask every day**, and remove 09:00 with its cross.
3. Press **Add a time** and pick a time two minutes from now. Set **Time to answer** to
   15 minutes (the shortest is 10, set with Postman) and press **Save**. The section
   now says it is waiting for Grace to agree.

**2. Agree as Grace.** Sign in as Grace. Above the help button: **Mary would like
MzaziCare to check on you every day at ...**. Press **Yes, check on me**.

**3. Answer it.** At the time, within a minute, Grace's screen shows **Are you all
right?** with **I am all right**. Without push on this phone the screen looks every two
minutes, so it can take that long; the API's terminal shows the text it would have sent
(`Check-ins: 1 asked`). Press it, and Mary's page lists **Today ...: answered in the
app**.

**4. Miss one.** Set another time two minutes ahead (as Mary, and agree again as Grace,
or as Grace on her own **You** page, which needs no agreement) and leave it. Half way
through the time to answer she is asked again. At the deadline Mary gets an alert marked
**Missed check-in**, and the console board shows the same tag. Grace's screen says her
family was told; pressing **I am all right** now withdraws the alert, and Mary is told
Grace answered. If Mary had pressed **I am on my way** first, the alert stays and only
records the answer.

**By text.** With replies on (Step 9), the check-in text ends "Reply 1 if you are". In
the Africa's Talking simulator, from Grace's number, reply `1`.

To stop the clock entirely for a run: `CHECK_INS_ENABLED=false npm run dev`.

---

## The first run on a new machine, or after pulling changes

Steps 1 to 6 assume the project has already been set up on this laptop. If it has not,
or if you have just pulled a change that touched the database, do this once first.

```bash
cd ~/Desktop/Mzazicare
npm install
```

That installs everything and, through postinstall hooks, also builds the design tokens
and generates the Prisma client.

```bash
cp .env.example backend/.env
```

Then open `backend/.env` and fill in the secrets. Two need generating:

```bash
openssl rand -base64 48    # paste as JWT_ACCESS_SECRET
openssl rand -base64 48    # paste as JWT_REFRESH_SECRET
```

If port 5432 is already taken on the machine, which it is on this one, create the
Compose environment file and change the port in the API's:

```bash
printf 'POSTGRES_PORT=5433\nREDIS_PORT=6379\n' > .env
```

and set `DATABASE_URL=postgresql://mzazicare:mzazicare@localhost:5433/mzazicare` in
`backend/.env`.

Then bring up the services and create the schema:

```bash
docker compose up -d
npm run db:migrate -w @mzazicare/api
npm run db:seed -w @mzazicare/api
```

For the Flutter app, once, from `frontend/mobile`:

```bash
flutter pub get
```

### After pulling a change that touched the database

Two commands, and the second is the one people forget:

```bash
npm run db:migrate -w @mzazicare/api    # apply new migrations
npx prisma generate --schema backend/prisma/schema.prisma
```

The generated Prisma client is not in the repository, so a pull that added a column
leaves your client describing the old schema. The symptom is a wall of TypeScript errors
saying a property does not exist on a type, and `npm test` refusing to run at all
because the test compiler hits them first. `prisma generate` clears every one of them.
It runs automatically on `npm install`, so a full reinstall also fixes it.

The seed prints every account it created. All of them sign in with `Dev!2026`, and the
seed refuses to run against anything that is not a local database.

---

## Google sign-in on the console

Optional. Without it the console signs in with a phone number or an email address, and
shows no Google button. With it, an administrator whose account has a Gmail address can
sign in with Google instead. It never creates an account, and only works for
administrators. About ten minutes the first time.

### Step 1. Make an OAuth client in Google Cloud

1. Go to https://console.cloud.google.com and sign in with any Google account.
2. At the top left, open the project list and choose **New project**. Name it
   `MzaziCare` and click **Create**. Make sure it is the selected project afterwards.
3. In the search bar at the top, type **Google Auth Platform** and open it. Click
   **Get started**.
4. Fill in the app information: app name `MzaziCare Operations`, and your own email as
   the support email. Click **Next**.
5. For **Audience**, choose **External**, then **Next**. For contact information, your
   email again, then **Next**, tick the agreement, and click **Create**.
6. In the left menu, open **Audience**. Under **Test users**, click **Add users** and add
   the Gmail address you will sign in with. While the app is in testing, only addresses
   listed here can use it, which is exactly right for a project like this.
7. In the left menu, open **Clients**, then **Create client**.
   - **Application type:** Web application
   - **Name:** `MzaziCare console (local)`
   - **Authorised JavaScript origins:** click **Add URI** and enter
     `http://localhost:5173`. Add `http://localhost` as well, which Google asks for when
     testing on localhost.
   - Leave **Authorised redirect URIs** empty: the console uses a pop-up, not a redirect.
8. Click **Create**. Copy the **Client ID**, which ends in `.apps.googleusercontent.com`.
   You do not need the client secret: nothing in MzaziCare uses it.

### Step 2. Give the client ID to the API

Open `backend/.env` and add the line, with your own ID:

```
GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

The client ID is not a secret (the console shows it to every browser), but `.env` is where
the API reads its settings. Restart `npm run dev`.

### Step 3. Put your Gmail address on the administrator account

Google proves an email address, and the API looks for an administrator with that
address. The seeded administrator's is `admin@mzazicare.example`, so change it to your
Gmail. In Postman, run **1. Sign in → Administrator**, then send this as the
administrator (Auth tab, Bearer token `{{adminToken}}`):

```
PATCH {{apiBase}}/auth/me
{ "email": "your.name@gmail.com" }
```

Or with curl, using the administrator's access token:

```bash
curl -X PATCH http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" \
  -d '{"email":"your.name@gmail.com"}'
```

Re-seeding the database puts the old address back.

### Step 4. Try it

Reload the console's sign-in page. **Sign in with Google** appears under the password.
Choose your Gmail in the pop-up, and you land on the board.

A Gmail address that is on no administrator account is refused with "No administrator
account uses this Google address". That is the system working.

### What it changes

Google's script is only fetched when the API has a client ID, and only by the sign-in
page. Once it is in a page it stays there with the console's own access, and the
screens after sign-in show elders' names and addresses, so the console reloads itself
after any sign-in on a page where Google's script was loaded. The signed-in page never
fetches it. A deployment that serves the console with a content security policy has to
allow `https://accounts.google.com` for scripts, frames and connections on the sign-in
page.

---

## Troubleshooting

**Postgres is published on 5432 rather than 5433.** The root `.env` is missing or does
not contain `POSTGRES_PORT=5433`. Compose reads that file to fill in the port. Create
it as shown above and run `docker compose up -d` again, which recreates the container.
Your data is in a named volume and is not affected.

**`P1010: User was denied access`.** You reached the Homebrew Postgres on 5432 instead
of the Docker one. Same cause, same fix.

**`ECONNREFUSED 127.0.0.1:5433`.** Nothing is listening. Either Docker Desktop is not
running, or the containers are not up. Run `docker compose ps`.

**`Cannot find native binding`.** The dependency tree was installed on a different
platform. Reinstall on this machine:

```bash
rm -rf node_modules package-lock.json
npm install
```

**`CocoaPods not installed or not in valid state`.** Only affects the iOS build of the
mobile app. `brew install cocoapods`. If Homebrew reports that a process has already
locked the formula, check with `pgrep -fl brew`: if nothing is running the lock is
stale, and `rm -f /usr/local/var/homebrew/locks/cocoapods.formula.lock` clears it.

**`Missing script: "dev:dashboard"`.** You are in a subfolder. Run `pwd`; it should
print `/Users/tavasii/Desktop/Mzazicare` with nothing after it.

**`notify-keyspace-events is ""`.** Redis came up without expiry events. The API sets
them at boot, so start the API once and try again. If it persists, the container was
started without the project's compose file.

**The dashboard loads but every request fails.** The API is not running, or it is on a
different port. Open http://localhost:3000/health directly; it should return JSON
naming Postgres and Redis separately.
