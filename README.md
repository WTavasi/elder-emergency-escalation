# MzaziCare Escalation

A real-time emergency response and escalation system for older people cared for at
home, built as the alerting part of the MzaziCare platform.

An elder presses one button. The system scores how serious it is likely to be, then
works down the people who look after them in order (caregiver, then family, then an
emergency responder) and moves on by itself when nobody answers in time. Messages go
by push notification, with SMS when push cannot get through. Every step is written to
an audit log, and every decision can be explained afterwards from the figures stored
with it.

Final year project, Strathmore University. **Not a medical device.** It detects
nothing on its own and does not replace emergency services.

## What it does

**For the elder** (the Flutter app, at large type sizes):

- One large help button at the bottom of the screen, within reach of a thumb.
- Ten seconds to stop an alert pressed by mistake: the screen turns yellow, a ring
  empties around the seconds left, and the phone taps once a second.
- When the phone has no data, the app offers other ways to ask: texting HELP to
  MzaziCare's shortcode, texting the family directly, or calling. It keeps trying to
  send the alert in the background.
- Who is coming and roughly how long they will be, without a map.
- An optional daily check-in ("Are you all right?").
- Calls through the app that answer themselves on the speaker.
- Light or dark screen, following the phone unless the elder chooses otherwise.

**For caregivers, family and responders** (the same app): a list of the alerts they are
part of, taking one on or saying they cannot come, directions, calling the elder, and
replying to an alert text with 1 or 2 when they have no app or no data.

**For community volunteers**: vetted neighbours who are asked as well as the family
when an alert is critical or the chain has nobody left to ask, if the elder agreed to
it. They go alongside the family, never instead of them.

**For administrators** (the web console): every open emergency as it happens, the full
record of any one of them, reporting figures, and user management. The console can see
emergencies but not act on them.

## How the escalation works, in brief

- **Severity** is a weighted score from five factors held in the database: care level,
  no cancel in the ten seconds, time of day, away from home, and recent activity. The
  score falls into one of three bands, which set how fast the chain moves and whether
  SMS goes out alongside push.
- **Each tier has a time limit.** A Redis key with an expiry starts each one, and its
  expiry promotes the alert to the next tier. A sweep every 15 seconds catches anything
  Redis missed.
- **The first person to accept owns the emergency.** Saying "I cannot come" moves it on
  at once, but never closes it.

The reasoning behind these choices is in [docs/decisions.md](docs/decisions.md).

## What is in this repository

| Folder | What it is |
| --- | --- |
| [`backend/`](backend) | The API: NestJS, PostgreSQL through Prisma, and Redis |
| [`frontend/mobile/`](frontend/mobile) | The Flutter app for elders, caregivers, family, responders and volunteers |
| [`frontend/dashboard/`](frontend/dashboard) | The administrator console: React and Vite |
| [`frontend/design-tokens/`](frontend/design-tokens) | Every colour, type size and spacing step, with a contrast check that fails the build |
| [`docs/`](docs) | How to run, test and understand the system |

## Getting started

New to the project, or starting the laptop from cold? Read
**[docs/running.md](docs/running.md)**, which walks through it step by step for a plain
terminal, VS Code and the Flutter app.

The short version, once the project is already set up:

```bash
docker compose up -d      # Postgres and Redis
npm run dev               # the API, on port 3000
npm run dev:dashboard     # the console, on port 5173
```

Sign in to the console at http://localhost:5173 with `+254700000001` and `Dev!2026`. The
seeded elder for the app is `+254700000010`, with the same password.

## Testing

```bash
npm test                         # API and console unit tests
cd frontend/mobile && flutter test   # the app
```

[docs/testing.md](docs/testing.md) covers all five layers, including the integration
suite against real Postgres and Redis and a scripted end-to-end demonstration. GitHub
Actions runs the contrast check, the unit tests, the app's tests and the integration
suite on every pull request.

## Documentation

Start at [docs/README.md](docs/README.md), which lists every document and what it
covers. The ones most people need are:

- [docs/running.md](docs/running.md): starting everything, step by step
- [docs/api.md](docs/api.md): every endpoint and who may call it
- [docs/decisions.md](docs/decisions.md): why things are the way they are
- [docs/design-language.md](docs/design-language.md): the rules the screens follow
- [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md): the product and the visual system,
  in the format of the [impeccable](https://github.com/pbakaus/impeccable) design guidance
  that UI work here follows
- [frontend/mobile/README.md](frontend/mobile/README.md): the app, screen by screen
