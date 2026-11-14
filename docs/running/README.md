# Running the system

Everything runs on one laptop: Postgres and Redis in Docker, the API, the console, and the
app when you want it. Pick a guide below. The terminal and VS Code guides start the same
processes.

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
on a screen. It has [its own guide](app.md), and it needs the API already running.

## Guides

| Guide | When to use it |
| --- | --- |
| [The first run on a new machine](first-run.md) | Once, on a new laptop, and after pulling changes |
| [From a terminal](terminal.md) | Starting the API and console by hand |
| [From VS Code](vscode.md) | The same, as VS Code tasks |
| [The Flutter app](app.md) | Running the app on a simulator or a phone, and signing in |
| [Trying each feature](optional-features.md) | Push, texts, calls, check-ins, volunteers, voice and the rest, one step each |
| [Google sign-in on the console](google-sign-in.md) | Optional sign-in with Google for administrators |
| [Troubleshooting](troubleshooting.md) | When something does not start or connect |

## The short version

Once the project is set up:

```bash
docker compose up -d      # Postgres and Redis
npm run dev               # the API, on port 3000
npm run dev:dashboard     # the console, on port 5173
```

Sign in to the console at http://localhost:5173 with `+254700000001` and `Dev!2026`. The
seeded elder for the app is `+254700000010`, with the same password.
