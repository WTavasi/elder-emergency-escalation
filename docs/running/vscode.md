# Running it from VS Code

The same processes as the terminal guide, started as VS Code tasks.

This does the same thing in one window, with each process in its own pane.

## Step 1. Start Docker Desktop

Exactly as in [the terminal guide](terminal.md). VS Code cannot do this for you.

## Step 2. Open the project

Open VS Code, then **File > Open Folder**, and choose `~/Desktop/Mzazicare`.

Open the folder itself, not `backend` or any subfolder. The tooling resolves from the
repository root, and opening a subfolder gives you type errors that do not exist and
tasks that are not there.

The first time you open it, VS Code shows a notification offering the recommended
extensions. Accept it. If you miss the notification, click the Extensions icon in the
left bar and type `@recommended` into the search box.

## Step 3. Run the tasks

Press **Shift + Cmd + P**, type `Run Task`, press Enter. Pick these in order, coming
back to the same menu each time:

1. **Services: start** — brings up Postgres and Redis. This finishes on its own.
2. **API: run** — opens a dedicated pane and keeps running.
3. **Dashboard: run** — opens another pane and keeps running.

Each task opens its own terminal pane, so you can see all three at once by clicking
between them in the terminal panel's dropdown on the right.

## Step 4. Open it

In the Dashboard pane, Cmd-click the `http://localhost:5173/` link. Sign in as above.

## Shutting down

Click the bin icon on each running terminal pane, or press Ctrl + C in each. Then run
the **Services: stop** task.

---

[Back to running the system](../README.md)
