# Backend modules

The backend is laid out the way the central MzaziCare repository lays out its own:
one folder per feature under `src/modules/<name>-service/`, the same role folders
inside each, a `README.md` in every module, and plumbing that every module uses in
`src/shared/`. The stack differs (NestJS on Postgres here, Express on MongoDB there),
so the folders match and the code inside them follows NestJS.

## Where to go

| To change | Go to |
| --- | --- |
| How an alert is raised, withdrawn or reopened | `emergency-service/services/alerts.service.ts` |
| Who is asked, in what order, and when it escalates | `emergency-service/services/escalation.service.ts` |
| Acknowledging, declining, closing, calling a responder | `emergency-service/services/escalation.service.ts` |
| The acknowledgement windows (Redis keys) | `emergency-service/services/escalation-timer.service.ts` |
| What happens when a window runs out | `emergency-service/consumers/escalation.listener.ts` |
| The safety net if expiry events never arrive | `emergency-service/workers/escalation-sweep.service.ts` |
| How severity is scored | `emergency-service/services/severity.service.ts`, weights are rows in the database |
| What an alert looks like to the app and the console | `emergency-service/views/alert-views.ts` |
| What a request may contain | the module's `validation/` folder |
| Sign-in, tokens, passwords | `auth-service/services/` |
| Who may call a route | `@Roles(...)` on the controller, the decorators in `shared/decorators/`, the guards in `auth-service/guards/` |
| Where an elder is staying | `elder-service/` |
| The wording of a message | `notification-service/services/notification-content.ts` |
| Push and SMS providers | `notification-service/providers/` |
| Retries and the SMS fallback | `notification-service/workers/notifications.processor.ts` |
| Live updates to the console | `realtime-service/` |
| The reporting figures | `report-service/services/dashboard.service.ts` |
| How long data is kept | `retention-service/workers/retention.service.ts` |
| The health check | `health-service/` |
| An environment variable | `shared/config/env.schema.ts` |
| Rate limits, security headers, error responses, request logging | `shared/middleware/` |
| Time, distance, redaction and other small helpers | `shared/utils/` |
| The database schema | `prisma/schema.prisma`, with the connection in `src/db/` |

All module paths above are under `backend/src/modules/`.

## Inside a module

Each module has only the folders it needs.

| Folder | Holds | In the central repo |
| --- | --- | --- |
| `controllers/` | The routes, and who may call each one | `controllers/` and `routes/`. NestJS declares routes on the controller, so there is no separate `routes/` |
| `services/` | The rules. No HTTP, no request objects | `services/` |
| `validation/` | Request shapes with their checks (DTO classes) | `validation/` (zod there) |
| `views/` | What a client is allowed to see | `views/` |
| `models/` | The module's own types. The schema is one file, `prisma/schema.prisma` | `models/` |
| `consumers/` | Reacting to something that is not a request | `consumers/` |
| `workers/` | Queue processors and scheduled sweeps | `workers/` |
| `providers/` | Adapters for an outside service. Notification-service only | `shared/services/` |
| `guards/` | Who is signed in and what they may do. Auth-service only | `shared/middleware/` |
| `<name>.module.ts` | NestJS wiring: what the module contains and what it needs | the router mount in `app.ts` |
| `README.md` | What the module owns, its endpoints, its files | `README.md` |

Tests sit beside the file they test as `<name>.spec.ts`. The end-to-end suite is in
`backend/test/`.

## Rules that hold today

- **`shared/` and `db/` never import from a module.** Plumbing flows into modules,
  never out of them.
- **A module uses another only through its services.** Emergency-service calls
  `NotificationsService` and the realtime publisher; it never touches another
  module's validation, views or internals.
- **Nothing reads `process.env` outside `shared/config/`.** Every variable is declared
  and validated once, in `env.schema.ts`.
- **Validation answers "is this well formed"; services answer "is this allowed".** A
  request can be perfectly formed and still refused, and that refusal is a service's
  job.

## How the modules depend on each other

```
emergency-service ──► notification-service
        │
        └──────────► realtime-service ──► auth-service
```

Every other module stands alone. There are no cycles.

## Differences from the central repo

Worth knowing before moving code between the two.

- **No `repository/` folder.** Services here query the database through Prisma
  directly. Porting a module means moving those queries into a repository.
- **No event bus.** Modules call each other's services through NestJS. The only events
  are Redis key expiry, which emergency-service consumes, and `emergency.updated` over
  Socket.IO, which realtime-service publishes.
- **One database schema**, `prisma/schema.prisma`, rather than a model file per module.
- **Relative imports** rather than the `@/` alias. Adding the alias needs the compiled
  output's imports rewritten at build time as well, so it is a separate change.
- **Mounted under `/api/v1`** rather than `/v1`.

## Adding a module

1. Create `src/modules/<name>-service/` with the folders it needs.
2. Write `<name>.module.ts` and add it to `imports` in `src/app.module.ts`.
3. Write its `README.md`: what it owns, what it does not, its endpoints, its files.
4. Add a row to the table at the top of this guide.
