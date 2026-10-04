# elder-service

Where an elder is staying, when it is not their registered home.

**Mounted at:** `/api/v1/elders`

## Scope

**Owns:** recording and clearing a stay away from home. Alerts raised during a stay are
located there; the registered home stays put, so the away-from-home severity factor still
has something to measure against. This is the alternative to tracking the device.

**Does not own:** the account itself (`auth-service`) or the alerts (`emergency-service`).

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/:id/place` | care circle, administrator | At home, or where |
| PUT | `/:id/place` | care circle, administrator | Record a stay away from home |
| DELETE | `/:id/place` | care circle, administrator | Back home |

An elder cannot change this about themselves, deliberately.

## Data it writes

The `current_*` columns on `users`.

## Files

| Path | What it is |
| --- | --- |
| `elders.module.ts` | NestJS wiring |
| `controllers/elders.controller.ts` | The three endpoints |
| `services/elders.service.ts` | The care-circle check and the record itself |
| `validation/set-place.dto.ts` | The shape of a stay |

## Depends on

Nothing.
