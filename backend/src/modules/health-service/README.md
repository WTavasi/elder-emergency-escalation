# health-service

Whether the API and what it depends on are up.

**Mounted at:** `/health`, outside `/api/v1` so a hosting platform's health check can find
it without knowing the API's prefix.

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/health` | anyone | Postgres and Redis, each reported by name; 503 if either is down |

## Files

| Path | What it is |
| --- | --- |
| `health.module.ts` | NestJS wiring |
| `controllers/health.controller.ts` | The one endpoint |
| `services/health.service.ts` | The checks |

## Depends on

Nothing.
