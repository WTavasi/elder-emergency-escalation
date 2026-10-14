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
| GET | `/policy` | administrator | How long records are kept, as the retention sweep enforces it |

Response times come with a median, a mean and a sample size, because a mean over a
handful of emergencies is not a finding on its own.

Each overview also carries `previous`, the same figures for the window before this one
and of the same length, so the console can say how a figure moved, and `daily`, one
point per day of the window with the quiet days included, counted in Nairobi time.

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
