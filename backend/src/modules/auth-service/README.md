# auth-service

Who someone is: registering, signing in, keeping a session alive, and signing out.

**Mounted at:** `/api/v1/auth`

## Scope

**Owns:** passwords, access tokens, refresh tokens, and the guards that check them on
every request.

**Does not own:** what a role may do on a particular route. That is declared on each
controller with `@Roles(...)`, from `shared/decorators/`.

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| POST | `/register` | anyone | Caregivers and family members only. 5 an hour |
| POST | `/login` | anyone | Phone and password. 20 per five minutes |
| POST | `/refresh` | anyone with a refresh token | Rotates it; a reused one ends every session. 60 per five minutes |
| POST | `/logout` | signed in | Ends every session for the account |
| GET | `/me` | signed in | The signed-in account |

## Data it writes

The password hash and refresh-token fingerprint on `users`. A refresh token is never
stored, only its SHA-256 fingerprint.

## Files

| Path | What it is |
| --- | --- |
| `auth.module.ts` | NestJS wiring |
| `controllers/auth.controller.ts` | The five endpoints |
| `services/auth.service.ts` | Registration, sign-in, refresh, sign-out |
| `services/password.service.ts` | scrypt hashing and checking |
| `services/token.service.ts` | Signing and verifying tokens |
| `guards/jwt-auth.guard.ts` | Every request needs a valid token unless marked `@Public()` |
| `guards/roles.guard.ts` | Enforces `@Roles(...)` |
| `validation/` | The request shapes |

The guards are registered for the whole application in `src/app.module.ts`, not here.
They stay in this module rather than `shared/` because they need the token service.

## Depends on

Nothing. `realtime-service` uses it to check socket connections.
