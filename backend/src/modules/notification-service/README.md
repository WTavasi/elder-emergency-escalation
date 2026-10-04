# notification-service

Getting a message to a person: push first, SMS when push cannot reach them.

**Mounted at:** nothing. It has no endpoints; other modules ask it to send.

## Scope

**Owns:** the wording of every message, the queue, retries, and the fallback from push to
SMS.

**Does not own:** deciding who should be told or when. That is `emergency-service`.

## How it decides what to do with a failure

A provider that returns `false` has failed permanently, so the message falls back to SMS.
A provider that throws has failed transiently, so the queue retries it. Mixing the two up
would either retry something impossible or give up on something recoverable.

## Data it writes

`notifications`, and a `NOTIFICATION_FAILED` entry in `audit_logs` when a delivery fails.

## Files

| Path | What it is |
| --- | --- |
| `notifications.module.ts` | NestJS wiring, and the choice of real or logging providers |
| `services/notifications.service.ts` | Puts messages on the queue |
| `services/notification-content.ts` | The wording, per channel and situation |
| `workers/notifications.processor.ts` | Sends, retries, falls back to SMS |
| `workers/notifications.queue.ts` | The queue's name and retry settings |
| `providers/push.provider.ts`, `providers/sms.provider.ts` | The two contracts every provider meets |
| `providers/fcm-push.provider.ts` | Firebase Cloud Messaging |
| `providers/africas-talking-sms.provider.ts` | Africa's Talking SMS |
| `providers/logging-push.provider.ts` | Development stand-ins for push and SMS that only log |
| `providers/firebase.factory.ts`, `providers/credentials-path.ts` | Loading the Firebase credential |

The API refuses to start in production while either channel is on a logging provider.

## Depends on

Nothing.
