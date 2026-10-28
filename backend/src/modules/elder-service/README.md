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
| DELETE | `/:id/chain/:entryId` | caregiver in that chain | Remove a family member or withdraw a held place. Not while an emergency is open |
| GET | `/:id` | care chain | Their details, where they are, and whether the caller may edit |
| PATCH | `/:id` | caregiver in that chain | Change their home or care level |
| GET | `/:id/place` | care circle, administrator | At home, or where |
| PUT | `/:id/place` | care circle, administrator | Record a stay away from home |
| DELETE | `/:id/place` | care circle, administrator | Back home |
| GET | `/:id/consent` | the elder, care chain, administrator | What was agreed, by whom, whether the elder confirmed it, what was withdrawn |
| POST | `/:id/consent/confirm` | the elder | Agree, for themselves, to what was agreed on their behalf |
| POST | `/:id/consent/grant` | the elder, caregiver in that chain | Give one consent after registration, `{ type }`: help from nearby volunteers, or one given back. Never processing. 20 an hour |
| POST | `/:id/consent/withdraw` | the elder, caregiver in that chain | Withdraw one consent, `{ type, confirm? }`. 20 an hour |

An elder cannot change any of this about themselves, deliberately.

## The chain

The rank is what dispatch reads, and everybody at a rank is asked together. The rank a
role belongs at comes from the escalation rules, so caregivers are tier one and family
tier two because the rules say so. A caregiver registering an elder takes tier one; each
relative added joins tier two beside the others, at once for somebody with an account, or
held in `chain_invitations` until that number signs up. The same person, or the same held
number, cannot be added to one chain twice.

Only a caregiver removes people, and never themselves or a responder. Nobody is removed
while the elder has an emergency open, because dispatch may be asking that person at that
moment; it is refused with 409 and can be done once the emergency is closed.

## Address search

Through this server to OpenStreetMap's Nominatim, never from the app, within its usage
policy: one request a second for everybody (a slot in Redis), an identifying User-Agent,
a day's caching, no search-as-you-type, and the attribution returned with every result.
https://operations.osmfoundation.org/policies/nominatim/

## Consent

A caregiver registering an elder consents on their behalf, which the Data Protection Act
allows only as far as the elder cannot consent themselves. So the elder is asked to
confirm at sign-in, as a line above the panic button that never blocks it, and the
elder, or a caregiver in their chain, can withdraw any consent. Nothing is overwritten:
the elder's confirmation is a new row granted by them (`grantor_relationship = 'self'`),
and a withdrawal is a time on the rows it ends.

What a withdrawal does, outside an emergency, is applied where data leaves the server
(`shared/utils/consent.ts`): contact sharing hides the elder's number, location sharing
hides their home, any stay and where past alerts happened, from the care circle's
screens, closed alerts and history. While an emergency is open, whoever is responding
still sees both, on the vital interests ground rather than consent. Withdrawing data
processing withdraws everything, deactivates the account and ends its sessions; it needs
`confirm: true`, and is refused while an emergency is open. The other side is told by
SMS: the caregivers, and the elder when a caregiver withdrew it.

## Data it writes

New elder accounts on `users`, with their home; three `consent_records` rows per elder,
given by the caregiver, then the elder's own confirmation and any withdrawals; `care_assignments`; `chain_invitations`; and the `current_*`
columns on `users` for a stay.

## Files

| Path | What it is |
| --- | --- |
| `elders.module.ts` | NestJS wiring |
| `controllers/elders.controller.ts` | All fourteen endpoints |
| `services/chain.service.ts` | Registering elders, the chain, adding and removing family |
| `services/address-search.service.ts` | The geocoder, its rate slot and cache |
| `services/elders.service.ts` | An elder's details, their home and care level, and stays away from home |
| `services/consent.service.ts` | Viewing, confirming, giving and withdrawing consent |
| `validation/` | The request shapes |

## Depends on

`auth-service` for passwords, phone codes and ending a session at once,
`notification-service` for the "you were added" and "consent withdrawn" SMS.
