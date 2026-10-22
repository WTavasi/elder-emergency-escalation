# check-in-service

The daily check-in: "are you all right?" at the elder's own times, and an alert to their
circle when nobody answers.

**Mounted at:** `/api/v1/elders/:id/check-ins` and `/api/v1/check-ins`

## Scope

**Owns:** the arrangement (times, time to answer, who set it up, whether the elder agreed),
each check-in asked, the one-minute clock that asks, reminds and marks them missed, and
the elder's answer.

**Does not own:** the alert a missed check-in raises, which is an ordinary emergency in
`emergency-service`, or how a message reaches a phone (`notification-service`).

## Endpoints

| Method | Path                            | Who                                      | What                                                                           |
| ------ | ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/elders/:id/check-ins`         | the elder, their chain, an administrator | The arrangement and the last seven check-ins                                   |
| PUT    | `/elders/:id/check-ins`         | the elder or their chain                 | Set up, change or turn off. Anybody but the elder waits for the elder to agree |
| POST   | `/elders/:id/check-ins/confirm` | the elder                                | Agree, or say no, to a set-up somebody else made                               |
| GET    | `/check-ins/mine`               | elder                                    | A check-in to answer, and a set-up to agree to                                 |
| POST   | `/check-ins/answer`             | elder                                    | "I am all right": `answered`, `withdrawn`, `noted` or `nothing`                |

## How it works

Off until somebody sets it up. The elder's own set-up starts at once; anybody else's, or
anybody else moving the times, waits for the elder's yes on their phone. Turning it off
never waits for anybody.

`CheckInClockService` runs every `CHECK_IN_TICK_MS` (a minute). It creates and sends each
check-in that has just fallen due, reminds once half way, and at the deadline marks it
missed and raises an alert with `trigger: MISSED_CHECK_IN` through `AlertsService.create`.
Every step is a conditional write, so it is safe with more than one API instance and
across restarts. Times are minutes after local midnight in the elder's time zone
(`check-in-times.ts`), turned into instants each day.

`CheckInMessenger` asks by push, with no personal data in the payload, and by SMS when
there is no push address or the push fails.

## Settings

`CHECK_INS_ENABLED` and `CHECK_IN_TICK_MS`, in `shared/config/env.schema.ts`. Old answers
are deleted by `retention-service` with the audit log window.

## Files

| Path                                     | What it is                                        |
| ---------------------------------------- | ------------------------------------------------- |
| `check-ins.module.ts`                    | NestJS wiring                                     |
| `controllers/check-ins.controller.ts`    | The five routes                                   |
| `services/check-ins.service.ts`          | Set-up, agreement, the elder's view and answering |
| `services/check-in-clock.service.ts`     | Asking, reminding and raising, every minute       |
| `services/check-in-messenger.service.ts` | The words, by push or SMS                         |
| `services/check-in-times.ts`             | Times of day in the elder's own time zone         |
| `validation/set-check-ins.dto.ts`        | The request shapes                                |

## Depends on

`emergency-service` (`AlertsService`) to raise and withdraw the alert, and
`notification-service` for push and SMS.
