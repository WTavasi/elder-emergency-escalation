# Running it from a terminal

Start here if you have just turned the laptop on.

## Step 1. Start Docker Desktop

Open it from Applications, or press Cmd + Space, type `Docker`, press Enter.

Wait for the whale icon in the menu bar to stop animating. Click it and check the menu
says **Engine running**. Nothing below this step works until it does. This usually
takes twenty to forty seconds from cold.

## Step 2. Open a terminal and go to the project

Press Cmd + Space, type `Terminal`, press Enter.

```bash
cd ~/Desktop/Mzazicare
```

Check you are in the right place. This should print the project path and list `apps`,
`packages` and `docker-compose.yml` among other things:

```bash
pwd && ls
```

## Step 3. Start Postgres and Redis

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

## Step 4. Start the API

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

## Step 5. Start the dashboard

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

## Step 6. Open it

Cmd-click the `http://localhost:5173/` link, or open a browser and go there yourself.

Sign in with the seeded administrator account:

- Phone: `+254700000001`
- Password: `Dev!2026`

Or choose **Email** above the field and use `admin@mzazicare.example` with the same
password. A **Sign in with Google** button appears too, once Google sign-in is set up as
described under [Google sign-in on the console](google-sign-in.md#google-sign-in-on-the-console).

You should land on the open emergencies board. If nothing is open, the board says so,
which is the state the system should usually be in.

## Shutting down

Press **Ctrl + C** in each of the two terminals. Then, if you want the databases
stopped too:

```bash
docker compose down
```

Use `down` and never `down -v`. The `-v` deletes the data volumes, which means
re-running the migrations and the seed next time.

---

[Back to running the system](../README.md)
