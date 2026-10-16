# admin-service

Accounts, for the administrator: every one listed, staff accounts created, and any
account deactivated or brought back. FR-10.

**Mounted at:** `/api/v1/admin`

## Scope

**Owns:** listing and searching every account, creating emergency responders and
administrators, editing an account's name, email and a responder's area, and
deactivating and reactivating accounts.

**Does not own:** signing anybody in or up (`auth-service`), an elder's chain
(`elder-service`).

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/users?q=&role=&status=&page=&pageSize=` | administrator | A page of accounts, with the total. `q` matches name, phone or email |
| POST | `/users` | administrator | A responder (with an area) or an administrator, with a first password. 30 an hour |
| PATCH | `/users/:id` | administrator | Name, email, and a responder's area |
| POST | `/users/deactivate` | administrator | `{ ids }`. Refused for your own account, anybody handling an open emergency, and the last administrator |
| POST | `/users/reactivate` | administrator | `{ ids }` |

## Deactivating, not deleting

Every account is named somewhere in emergency history, as the elder who raised one or
the person who answered it, and that history has to stay readable. So nothing is deleted.
A deactivated account (`users.deactivated_at` set):

- cannot sign in, by password, by Google, or by resetting its password;
- loses every session straight away: its refresh fingerprint is cleared, its access
  tokens are refused from the next request (a short-lived Redis marker,
  `revoked:access:{userId}`, outlives any token issued before it), and any open live
  connection is closed;
- is never sent an emergency: dispatch skips its place in a chain and moves to the next,
  and responder matching leaves it out.

Bringing it back clears the column and the Redis marker. The person signs in again with their old password.

## Staff accounts

Caregivers and family members sign themselves up, and elders are registered by their
caregiver, because each of those carries a consent naming who gave it. Responders and
administrators are staff, so they are set up here. The administrator chooses a first
password and hands it over in person; the person is sent an SMS saying the account
exists, and never the password.

## Files

| Path | What it is |
| --- | --- |
| `admin.module.ts` | NestJS wiring |
| `controllers/users.controller.ts` | The five endpoints, administrators only |
| `services/user-admin.service.ts` | Listing, creating, editing, deactivating |
| `validation/user-admin.dto.ts` | The request shapes |

## Depends on

`auth-service` for password hashing and `notification-service` for the SMS.
