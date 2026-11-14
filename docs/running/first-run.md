# The first run on a new machine

What to install and set up once, and what to do after pulling changes.

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

## After pulling a change that touched the database

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

[Back to running the system](../README.md)
