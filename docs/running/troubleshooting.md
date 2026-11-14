# Troubleshooting

What to check when something does not start or connect.

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

**`your project still has CocoaPods integration`, or `Unable to load contents of file
list: Pods-Runner...`.** Only affects the iOS build of the mobile app, on a copy made
before the app moved to Swift packages. From `frontend/mobile`, run
`rm -rf ios/Pods ios/Podfile ios/Podfile.lock && flutter clean && flutter pub get`, then
build again. CocoaPods is no longer needed.

**`Missing script: "dev:dashboard"`.** You are in a subfolder. Run `pwd`; it should
print `/Users/tavasii/Desktop/Mzazicare` with nothing after it.

**`notify-keyspace-events is ""`.** Redis came up without expiry events. The API sets
them at boot, so start the API once and try again. If it persists, the container was
started without the project's compose file.

**The dashboard loads but every request fails.** The API is not running, or it is on a
different port. Open http://localhost:3000/health directly; it should return JSON
naming Postgres and Redis separately.

[Back to running the system](../README.md)
