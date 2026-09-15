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

## Screens

- **Open emergencies.** Everything still live, ordered by whoever has been waiting
  longest without an answer, with the time left on the current tier counting down.
  Updated by the socket, refreshed over HTTP when the socket drops.
- **History.** The searchable record, filtered by state, severity and date. Every
  filter is applied by the API, so records nobody asked to see never reach the page.
- **Reporting.** Response times as a median as well as a mean, how far emergencies
  travelled down the chain, and per-channel delivery reliability.
- **Data handling.** What the console shows, what this browser stores and what is
  not collected.

## Design

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
duration formatting that the timeline and the reporting figures are read from.
