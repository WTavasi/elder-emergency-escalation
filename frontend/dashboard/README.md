# MzaziCare Operations

The administrator console for the escalation framework. It shows every open
emergency as it happens, the full record of any one of them, and the figures the
evaluation chapter reports.

## A note on native binaries

`node_modules` is shared with any other machine that opens this folder, and Vite's
bundler ships a compiled binary chosen for one platform at install time. If you ever
see "Cannot find native binding", the tree was installed somewhere else. The fix is a
clean reinstall on this machine:

```bash
rm -rf node_modules package-lock.json
npm install
```

## Running it

The dashboard is a client. It needs the services and the API running first.

```bash
docker compose up -d                  # Postgres and Redis
npm run dev                           # the API, on port 3000
npm run dev:dashboard                 # this app, on port 5173
```

Open http://localhost:5173 and sign in with the seeded administrator account,
`+254700000001`, password `Dev!2026`.

Requests go through the Vite proxy to the API rather than cross-origin, so the
browser sends the same paths a deployed build sends and a routing mistake cannot
hide behind a permissive development setting.

## What it can and cannot do

The console is read-only over emergencies, and that is enforced by the API rather
than by hiding controls. An administrator is not part of any elder's care chain, so
the server refuses acknowledge, resolve and request-responder from this account.
Taking ownership of an emergency belongs to the people that elder named.

An administrator can read every emergency record and the reporting figures. A
signed-in account with any other role is turned away at the door rather than shown
an empty console.

## Where things live

Each screen is a folder under `src/features/`; anything two screens share is under
`src/shared/`. To change a screen, start in its feature folder.

| Folder | What is in it |
| --- | --- |
| `src/features/auth/` | Sign-in |
| `src/features/board/` | Open emergencies, with the countdowns |
| `src/features/event-detail/` | One emergency: its chain and what has happened |
| `src/features/history/` | The searchable record |
| `src/features/reporting/` | Response times, escalation depth, delivery reliability, trends |
| `src/features/users/` | Every account: adding staff, editing, deactivating |
| `src/features/volunteers/` | Vetting community volunteers |
| `src/features/privacy/` | The privacy and data panel |
| `src/shared/phone/` | The phone field with its country list, and reading a typed number |
| `src/shared/api/` | The HTTP client, the socket, and the response types |
| `src/shared/state/` | Who is signed in, and the live list of open emergencies |
| `src/shared/components/` | The page layout and small shared parts |
| `src/shared/hooks/` | Loading data, counting down, the time now, keyboard shortcuts |
| `src/shared/utils/` | Formatting dates, durations and labels; an emergency's record in sentences |

`App.tsx` holds the routes, `main.tsx` starts the app, and `styles.css` is the one
stylesheet. Tests sit beside the file they test.

## Screens

- **Open emergencies.** Everything still live, ordered by whoever has been waiting
  longest without an answer, with the time left on the current tier counting down and
  how long ago each was raised. Updated by the socket, refreshed over HTTP when the
  socket drops; the bar says when it last heard anything.
- **History.** The searchable record, a page at a time, by elder name, state, severity
  and date, with a CSV export. Filters apply as they are chosen, and every one is applied
  by the API, so records nobody asked to see never reach the page.
- **Reporting.** Each figure for the period with how it moved against the period before,
  a daily chart, how far emergencies travelled down the chain, and per-channel delivery
  reliability.
- **Users.** Every account, with adding responders and administrators, editing, and
  deactivating or reactivating, one at a time or several after pressing **Select**.
- **Volunteers.** Community volunteers' applications, to approve or not, and the
  approved ones, to suspend.

A row in any list opens what it shows when pressed anywhere. From the keyboard, the up
and down arrows move between rows and Return opens one; Command-F or Ctrl+F goes to the
search on History and Users.

## Privacy, in layers

There is no privacy page in the navigation. The statement is one link away from
everywhere, as **Privacy and data** under the sign-in form and in the account menu, and
the short versions sit where the data is: a **View only** marker on an emergency saying
the care chain acts and an administrator reads, and a line under History giving the
retention period the server actually enforces (`GET /api/v1/dashboard/policy`).

## Design

The console follows a Mac app, as the mobile app follows an iPhone one: the computer's
own face (`system-ui`, nothing bundled), a grey sidebar, a large title under a bar on
each page, lists rather than spreadsheets, and sheets for questions. The rules are in
`docs/design-language.md`, and why in `docs/decisions.md`.

Every colour, space, radius and type size comes from `@mzazicare/tokens`. There is
no literal colour anywhere in the stylesheet, because the contrast gate can only
guarantee a pair it knows about and a hard-coded value is the one it cannot check.
Dark mode follows the same tokens, so it is covered by the same gate.

State is always spelled out as well as coloured, the focus ring is never removed,
every table column has a header, and anyone who has asked their system for reduced
motion gets none.

## Tests

```bash
npm run test -w @mzazicare/dashboard
```

They cover the three things that fail quietly: the ordering rule that decides which
emergency an operator works next, the token refresh path, which could otherwise loop
against the API or leave a signed-in console whose every request is refused, and the
duration formatting that the timeline and the reporting figures are read from. Beside
those, the sentences an emergency's record is told in, a list row opening its record and
moving by keyboard, filters applying as they are chosen, and choosing several users.
