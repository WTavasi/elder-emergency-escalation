# auth-service

Who someone is: proving a phone number, signing up, signing in, keeping a session alive,
and signing out.

**Mounted at:** `/api/v1/auth`

## Scope

**Owns:** sign-up codes, passwords, access tokens, refresh tokens, and the guards that
check them on every request.

**Does not own:** what a role may do on a particular route. That is declared on each
controller with `@Roles(...)`, from `shared/decorators/`.

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/verify-phone` | anyone | Send a six-digit code by SMS. Always 202. 10 an hour per address |
| POST | `/register` | anyone with a code | Caregivers and family members only. 5 an hour |
| POST | `/login` | anyone | Phone and password. 20 per five minutes |
| POST | `/refresh` | anyone with a refresh token | Rotates it; a reused one ends every session. 60 per five minutes |
| POST | `/logout` | signed in | Ends every session for the account |
| GET | `/me` | signed in | The signed-in account |
| PATCH | `/me` | signed in | Change your name or email. A phone number is not changed here: it is how the account is found and how codes reach it |
| POST | `/change-password` | signed in | Needs the current password. Returns fresh tokens and ends every other session. 10 per five minutes |

## Sign-up codes

Six digits, kept in Redis as a hash salted with the number, never in the database. Ten
minutes to live, five wrong guesses, used once. One number is sent at most one code every
30 seconds and five an hour. A number that already has an account is sent "somebody
tried" instead of a code, and the endpoint answers the same either way, so it cannot be
used to find out who is registered. `elder-service` uses the same codes when a caregiver
registers an elder.

## Data it writes

`users` (the account, the password hash and refresh-token fingerprint), the account's own
`consent_records` row at sign-up, and, at sign-up, `care_assignments` for any chain places
held for the number in `chain_invitations`, which it then deletes. A refresh token is
never stored, only its SHA-256 fingerprint.

## Files

| Path | What it is |
| --- | --- |
| `auth.module.ts` | NestJS wiring |
| `controllers/auth.controller.ts` | The eight endpoints |
| `services/auth.service.ts` | Sign-up, sign-in, refresh, sign-out, profile and password changes |
| `services/phone-verification.service.ts` | Sending and checking sign-up codes |
| `services/password.service.ts` | scrypt hashing and checking |
| `services/token.service.ts` | Signing and verifying tokens |
| `guards/jwt-auth.guard.ts` | Every request needs a valid token unless marked `@Public()` |
| `guards/roles.guard.ts` | Enforces `@Roles(...)` |
| `validation/` | The request shapes, and `phone.ts`, the one phone format the API accepts |

The guards are registered for the whole application in `src/app.module.ts`, not here.
They stay in this module rather than `shared/` because they need the token service.

## Depends on

`notification-service`, to send codes. `realtime-service` and `elder-service` use it.
