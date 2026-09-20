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

The Flutter app is not built yet, so there is no fifth step.

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

Open the folder itself, not `apps/api` or any subfolder. The tooling resolves from the
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
cp .env.example apps/api/.env
```

Then open `apps/api/.env` and fill in the secrets. Two need generating:

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
`apps/api/.env`.

Then bring up the services and create the schema:

```bash
docker compose up -d
npm run db:migrate -w @mzazicare/api
npm run db:seed -w @mzazicare/api
```

The seed prints every account it created. All of them sign in with `Dev!2026`, and the
seed refuses to run against anything that is not a local database.

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
