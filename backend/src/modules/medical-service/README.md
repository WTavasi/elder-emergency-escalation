# medical-service

An elder's medical details: what a helper should know in an emergency, as the medical ID
on a phone holds it.

**Mounted at:** `/api/v1/elders/:id/medical` and `/api/v1/alerts/:id/medical`

## Scope

**Owns:** keeping the details sealed, who may see and change them, recording every look
and change, a caregiver's word that they decide for an elder who cannot, and reading the
ticks against what is happening on an alert.

**Does not own:** the `MEDICAL_PROFILE` consent itself (`elder-service`, which also
deletes the details on withdrawal), or the retention sweep (`retention-service`).

## Endpoints

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `/elders/:id/medical` | the elder, caregivers | The details, consent, choices, changes and looks |
| PUT | `/elders/:id/medical` | the elder, caregivers | Replace the details. 30 an hour |
| POST | `/elders/:id/medical/guardian` | caregivers | Decide for an elder who cannot, so the details are shared on an alert. 10 an hour |
| DELETE | `/elders/:id/medical/guardian` | the elder, caregivers | Take that back. The details stay. 10 an hour |
| GET | `/alerts/:id/medical` | the elder, care chain, responders asked | The details on an alert, with what they mean for it |
| GET | `/alerts/:id/medical/views` | administrator | Who opened them during the alert, and on whose word they are shared |

## Settings

`MEDICAL_DATA_KEY`: 32 random bytes in base64 (`openssl rand -base64 32`). Unset, the
feature is off. Changing it makes every stored profile unreadable.

See docs/decisions.md, "Medical details, under the Data Protection Act".
