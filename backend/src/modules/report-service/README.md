# report-service

The figures behind the console's reporting screen.

**Mounted at:** `/api/v1/dashboard`

## Scope

**Owns:** live counts, response times, how far emergencies travel down the chain, and how
reliably each channel delivers.

**Does not own:** any data. It only reads.

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/overview?days=` | administrator | Every figure the reporting screen shows |

Response times come with a median, a mean and a sample size, because a mean over a
handful of emergencies is not a finding on its own.

## Files

| Path | What it is |
| --- | --- |
| `dashboard.module.ts` | NestJS wiring |
| `controllers/dashboard.controller.ts` | The one endpoint |
| `services/dashboard.service.ts` | The queries and arithmetic |
| `views/dashboard.types.ts` | The shape the console receives |

The route stays `/dashboard` because that is what the console calls.

## Depends on

Nothing.
