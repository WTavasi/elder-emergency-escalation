# notification-service

Getting a message to a person: push first, SMS when push cannot reach them.

**Mounted at:** nothing. It has no endpoints; other modules ask it to send.

Emergency notifications go through the queue, with retries and the SMS fallback. Sign-up
codes and "you were added" messages go straight out through `DirectSmsService`: they
belong to no emergency, and a code that arrives minutes later after a retry is worse than
one that fails now and can be asked for again.

## Scope

**Owns:** the wording of every message, the queue, retries, and the fallback from push to
SMS.

**Does not own:** deciding who should be told or when. That is `emergency-service`.

## How it decides what to do with a failure

A provider that returns `false` has failed permanently, so the message falls back to SMS.
A provider that throws has failed transiently, so the queue retries it. Mixing the two up
would either retry something impossible or give up on something recoverable.

## Replies

With `SMS_INBOUND_TOKEN` set, alert texts end "Reply 1 if you can go, 2 if you cannot"
(`REPLY_ASK` in `notification-content.ts`), and with `AT_SHORTCODE` set every SMS is sent
from that shortcode so the reply comes back to it. Reading the reply belongs to the
emergency service (`SmsRepliesService`), because answering is an acknowledgement or a
decline; this module only words the question and sends the confirmation.

## Data it writes

`notifications`, and a `NOTIFICATION_FAILED` entry in `audit_logs` when a delivery fails.

## Files

| Path | What it is |
| --- | --- |
| `notifications.module.ts` | NestJS wiring, and the choice of real or logging providers |
| `services/notifications.service.ts` | Puts messages on the queue |
| `services/notification-content.ts` | The wording, per channel and situation, and for account messages |
| `services/direct-sms.service.ts` | An SMS sent at once, outside the queue, for codes and invitations |
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
