# community-service

Community volunteers: vetted people near an elder, asked to go in an emergency beside the
elder's own chain.

**Mounted at:** `/api/v1/volunteer` (the volunteer's own) and `/api/v1/admin/volunteers`
(the vetting queue).

## Scope

**Owns:** volunteer applications and their vetting, availability, who is asked about an
emergency and what each said, and what volunteers are told.

**Does not own:** the emergency itself, which stays the chain's (`emergency-service`), or
the consent an elder gives to it (`elder-service`).

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/volunteer/me` | volunteer | Their application and standing |
| PUT | `/volunteer/me` | volunteer | Send or change the application: training, note, area, radius |
| PUT | `/volunteer/me/availability` | volunteer | Available or not; on only once approved |
| GET | `/volunteer/calls` | volunteer | The emergencies they were asked about |
| GET | `/volunteer/calls/:eventId` | volunteer, if asked | One |
| POST | `/volunteer/calls/:eventId/accept` | volunteer, if asked | "I can go"; the first wins |
| POST | `/volunteer/calls/:eventId/decline` | volunteer, if asked | "I cannot go" |
| POST | `/volunteer/calls/:eventId/withdraw` | the one going | "I can no longer go"; the others are asked again |
| POST | `/volunteer/calls/:eventId/arrived` | the one going | "I'm here" |
| GET | `/admin/volunteers` | administrator | The vetting queue |
| POST | `/admin/volunteers/:id/review` | administrator | Approve, reject or suspend, with a note |

## How it works

`VolunteerCallsService.askNearby` is called by the escalation service, without waiting:
with a critical alert, and at the responder tier when no professional covers the place.
It asks once per emergency, only for an elder with an active `COMMUNITY_HELP` consent, and
only approved, available volunteers whose own area contains the alert, nearest first, up
to `VOLUNTEER_MAX_ASKED`. A volunteer is told the distance and how urgent, never who or
where, until they accept. The first to accept (a conditional write) is given the elder's
name, number and address while the emergency is open; the others are stood down; the
emergency itself is not touched.

Messages go out through `VolunteerMessenger`, push first and SMS when there is no push,
not through the notification queue, which would make every volunteer asked a participant.

## Settings

`VOLUNTEERS_ENABLED` and `VOLUNTEER_MAX_ASKED`, in `shared/config/env.schema.ts`.

## Files

| Path | What it is |
| --- | --- |
| `community.module.ts` | NestJS wiring |
| `controllers/volunteer.controller.ts` | The volunteer's routes |
| `controllers/volunteer-admin.controller.ts` | The vetting queue |
| `services/volunteers.service.ts` | Applications, availability and vetting |
| `services/volunteer-calls.service.ts` | Asking, accepting, withdrawing, arriving, standing down |
| `services/volunteer-messenger.service.ts` | Push, then SMS |
| `services/volunteer-content.ts` | What volunteers and the circle are told |
| `validation/volunteer.dto.ts` | The request shapes |

## Depends on

`notification-service` for push and SMS. Called by `emergency-service`; calls nothing back.
