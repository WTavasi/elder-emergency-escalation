# dev-tools

Help for testing on one machine. It lets the Postman collection run from start to finish,
as often as you like, without anybody copying a code out of the terminal.

**On only** when `NODE_ENV` is not `production` and `SMS_PROVIDER` is `logging`, so
texts are printed rather than sent. Otherwise every endpoint answers 404, as if it were not
there. With a real SMS provider a code reaches a phone, and reading it back here would let
anybody who can reach the API skip proving they hold that phone.

**Mounted at:** `/api/v1/dev`

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/dev/texts?to=+254…` | administrator | The last texts printed for that number, newest first: where the collection finds a sign-up or reset code |
| POST | `/dev/clear-limits` | anyone | Starts the sign-in and code limits again from zero, as `npm run dev:clear-limits` does |

## Files

| Path | What it is |
| --- | --- |
| `dev-tools.module.ts` | NestJS wiring |
| `controllers/dev-tools.controller.ts` | The two endpoints, and the 404 when off |
| `services/dev-tools.service.ts` | When it is on, and clearing the counters |
| `../notification-service/providers/dev-outbox.ts` | The last fifty printed texts, in memory, forgotten on restart |

## Depends on

`notification-service` for the printed texts, and Redis for the counters.
