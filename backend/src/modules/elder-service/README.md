# elder-service

Elders and the people who look after them: registering an elder, their chain, their home,
and where they are staying when it is not home.

**Mounted at:** `/api/v1/elders`

## Scope

**Owns:** a caregiver registering an elder, the elder's chain as a caregiver sets it up,
finding the coordinates of a home address, and recording a stay away from home.

**Does not own:** the accounts of caregivers and family (`auth-service`), or alerts
(`emergency-service`).

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/` | caregiver, family | The elders the caller looks after |
| POST | `/` | caregiver | Register an elder, with a code from their phone. 10 an hour |
| GET | `/address-search?q=` | caregiver, family, administrator | Coordinates for an address. 20 per five minutes |
| GET | `/:id/chain` | care chain, administrator | Who is asked, in order, and places held for invitees |
| POST | `/:id/chain` | caregiver in that chain | Add a family member by phone. 20 an hour |
| GET | `/:id/place` | care circle, administrator | At home, or where |
| PUT | `/:id/place` | care circle, administrator | Record a stay away from home |
| DELETE | `/:id/place` | care circle, administrator | Back home |

An elder cannot change any of this about themselves, deliberately.

## The chain

Each rank in a chain holds one person, and the rank is what dispatch reads. The rank a
role belongs at comes from the escalation rules, so caregivers are tier one and family
tier two because the rules say so. A caregiver registering an elder takes tier one; adding
family fills tier two, at once for somebody with an account, or held in
`chain_invitations` until that number signs up.

## Address search

Through this server to OpenStreetMap's Nominatim, never from the app, within its usage
policy: one request a second for everybody (a slot in Redis), an identifying User-Agent,
a day's caching, no search-as-you-type, and the attribution returned with every result.
https://operations.osmfoundation.org/policies/nominatim/

## Data it writes

New elder accounts on `users`, with their home; three `consent_records` rows per elder,
given by the caregiver; `care_assignments`; `chain_invitations`; and the `current_*`
columns on `users` for a stay.

## Files

| Path | What it is |
| --- | --- |
| `elders.module.ts` | NestJS wiring |
| `controllers/elders.controller.ts` | All eight endpoints |
| `services/chain.service.ts` | Registering elders, the chain, adding family |
| `services/address-search.service.ts` | The geocoder, its rate slot and cache |
| `services/elders.service.ts` | Stays away from home |
| `validation/` | The request shapes |

## Depends on

`auth-service` for passwords and phone codes, `notification-service` for the "you were
added" SMS.
