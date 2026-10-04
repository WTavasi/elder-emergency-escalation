# retention-service

Deleting what the privacy notice says will be deleted, when it says.

**Mounted at:** nothing. It runs on a schedule.

## Scope

**Owns:** a daily sweep that deletes closed emergencies past their retention window, then
audit entries past their own shorter one. An open emergency is never deleted, whatever its
age, and the window counts from when an emergency closed rather than when it was raised.

## Run it by hand

```bash
npm run retention:sweep -w @mzazicare/api
```

## Settings

`RETENTION_RESOLVED_EVENT_DAYS`, `RETENTION_AUDIT_LOG_DAYS`, and `RETENTION_ENABLED`, which
the integration suite turns off. All in `shared/config/env.schema.ts`.

## Files

| Path | What it is |
| --- | --- |
| `retention.module.ts` | NestJS wiring |
| `workers/retention.service.ts` | The sweep and its daily schedule |
| `retention.cli.ts` | The command behind `retention:sweep` |

## Depends on

Nothing.
