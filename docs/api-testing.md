# Testing the API with Postman

A Postman collection with every endpoint, already filled in, is in
[`docs/postman/`](postman/). It signs each test account in for you, saves the tokens, and
checks every answer, so most of it is a matter of pressing Run.

This guide goes in small steps. Do them in order the first time.

---

## Part 1. Before you start

### 1.1 The API has to be running

Follow [running.md](running.md) Guide A, steps 1 to 4: Docker Desktop open, Postgres and
Redis started, then `npm run dev`. Leave that terminal open; you will read sign-up codes
from it later.

Check it in a browser: open http://localhost:3000/health. You should see
`"status":"ok"`.

### 1.2 The test accounts have to exist

If you have never seeded the database, or reset it, run this once from the project folder:

```bash
npm run db:seed -w @mzazicare/api
```

Every seeded account uses the password `Dev!2026`.

| Phone | Who |
| --- | --- |
| `+254700000010` | Grace Wanjiru, elder |
| `+254700000020` | Mary Otieno, caregiver, tier 1 for Grace |
| `+254700000030` | Family member, tier 2 for Grace |
| `+254700000040` | Emergency responder, tier 3 |
| `+254700000001` | Administrator |

### 1.3 Install Postman

Download the free desktop app from https://www.postman.com/downloads/ and open it. It asks
you to sign in; a free account is fine. You can also choose to continue without one.

---

## Part 2. Bring the collection in

### 2.1 Import both files

1. In Postman, click **Import** (top left).
2. Drag in both files from the project's `docs/postman` folder:
   - `MzaziCare.postman_collection.json`, the requests;
   - `MzaziCare.local.postman_environment.json`, the addresses, phone numbers and the
     places tokens are kept.
3. Click **Import**.

**MzaziCare API** now appears under **Collections** on the left.

### 2.2 Choose the environment

Top right there is a dropdown that says **No environment**. Choose **MzaziCare local**.

Every request uses values from it, such as `{{apiBase}}` and `{{caregiverToken}}`, and
nothing works until it is chosen. To see what it holds at any moment, click the eye icon
next to the dropdown.

### 2.3 The first request

1. Open **MzaziCare API → 0. Is it running → Health**.
2. Click **Send**.
3. The answer appears at the bottom, with `200 OK`. The **Test Results** tab should say
   1/1 passed.

If it says `Could not send request` or `ECONNREFUSED`, the API is not running. Go back to 1.1.

---

## Part 3. Sign everybody in

1. Hover over the **1. Sign in** folder, click the three dots, and choose **Run folder**.
2. Click **Run MzaziCare API**.

Each request shows green when its checks pass. Every account's token is now saved in the
environment (look under the eye icon), and every other request picks up the right one by
itself.

**Tokens last 15 minutes.** When requests start answering `401 Unauthorized`, run this
folder again.

---

## Part 4. The emergency walkthroughs

Three folders each tell one story. Run each one with **Run folder**, as in Part 3, or open
the requests one by one and press **Send** in order, reading each answer as you go. That
second way is the better one for a demonstration.

| Folder | What it shows |
| --- | --- |
| **2. An emergency, start to finish** | Grace raises an alert, Mary sees it in her list, opens it, takes it on and closes it |
| **2b. On the way, and arriving** | Mary turns on sharing, takes Grace's alert on, shares a position about 2 km away (an ETA comes back), Grace sees the time but not the position, the family member sees both, Mary reaches the gate and it becomes ON_SCENE with the arrival time, then she closes it and turns sharing off |
| **2c. Answering by text** | Grace raises an alert and Mary answers it by text with 1, as the SMS gateway would post it; the alert is hers, marked as answered by text; a second 1 changes nothing; a number nobody has gets no reply; a wrong secret finds nothing. Needs the API started with `SMS_INBOUND_TOKEN=local-text-replies-0123456789` (see [running.md](running.md), Step 9) |
| **2d. Talking through the app** | Mary asks to talk to Grace and gets a token for that emergency's room; Grace's alert then says Mary started a call; the console is refused. Needs a LiveKit project in `backend/.env` ([running.md](running.md), Step 10); without one the requests check for 503 instead |
| **3. Declining moves it on** | Mary cannot come, so tier 2 is asked at once; the family member takes it on, calls in a responder and closes it |
| **4. Withdrawing and reopening** | Grace withdraws inside the 10 second grace window; Mary reopens it because she could not reach her |

The request that raises an alert saves its id as `alertId`, so the requests after it act
on that alert.

If the web console is open on the board at the same time, signed in as the administrator,
you can watch each alert appear and change there as you send the requests.

**Folder 4 has to be quick.** An elder can only withdraw within 10 seconds of raising the
alert, which is easy with Run folder and tight by hand.

---

## Part 5. Signing up

This one needs a value you type yourself: the code that would be sent by SMS.

1. Open **5. Signing up → Send a code** and click **Send**. The answer is `202 Accepted`
   with nothing in it.
2. Look in the terminal running the API. In development nothing is really sent; the
   message is written there instead, on a line like:
   ```
   [LoggingSmsProvider] SMS to +254***78: 483920 is your MzaziCare code. It expires in 10 minutes.
   ```
3. Click the eye icon (top right), then **Edit**. In the row for `code`, put the six
   digits in the **Current value** column, and save.
4. Open **Create the account** and click **Send**. `201 Created` means the account exists,
   and its token is saved as `newToken`.

Each phone number can only sign up once. To sign up again, change `newPhone` in the
environment to another number, for example `+254712345677`.

The same number can only be sent one code every 30 seconds, so if nothing appears in the
terminal, wait half a minute and send again.

To try a forgotten password, run folder **8c. Forgotten password** the same way: send the
first request, copy the code from the line ending `password reset code` into the
`resetCode` variable, then send the second.

---

## Part 6. Elders and their chains

This uses the account you made in Part 5, which is a caregiver.

1. **Elders I look after** answers an empty list: a new caregiver looks after nobody yet.
2. **Search for a home address** finds coordinates for "Kileleshwa, Nairobi" and saves
   the first match for the next requests. Change the `q` value in the **Params** tab to
   search for somewhere else. This one goes out to OpenStreetMap, so it needs internet,
   and it allows one search a second across everybody: do not run it in a loop.
3. **Send a code to the elder's phone**, then copy that code from the API terminal into
   the `elderCode` variable, as in Part 5.
4. **Register the elder**. The answer shows `myTier: 1`: the caregiver is first in the
   new elder's chain.
5. **The elder's chain** lists who is asked, in order.
6. **Add a family member** adds `inviteePhone`. Nobody has that number yet, so the place
   is held for them, shown as `"status": "invited"`. Sending it a second time answers
   `409 Conflict`, because the family place holds one person.

Folder **6b. Looking after an elder** carries on with the same elder: it reads the
elder's details, changes their care level, and withdraws the held family place, after
which **Add a family member** in folder 6 works again.

---

## Part 7. The rest

| Folder | What it does |
| --- | --- |
| **7. Where an elder is staying** | Records Grace as staying elsewhere, then back home |
| **8. Reporting** | The administrator's figures, and a filtered history |
| **8b. My account** | Adds an email to the account from Part 5, changes its password, then changes it back |
| **8c. Forgotten password** | A reset code for the account from Part 5, then a new password with it. Needs the code typed in, as in Part 5 |
| **8d. Accounts (administrator)** | Lists and searches accounts, adds a responder, deactivates them (and shows they can no longer sign in), reactivates them, and pages the history with a name search |
| **8e. Privacy and this phone** | Grace reads and confirms the consent given on her behalf, Mary sees the same record, then Mary's phone registers a push address, a too-short one is refused, and the address is forgotten |
| **9. Things that must be refused** | Each request here should fail, and passes when it does |

Folder 9 is worth running in a demonstration. It shows that a request with no token is
refused, that a wrong password and an unknown number get exactly the same answer, that
asking for a code for a registered number reveals nothing, that the administrator cannot
take on an emergency, that a caregiver cannot read the reporting figures, that an elder
cannot move herself, that a client cannot set its own severity, that a mistyped
current password is not mistaken for an expired session, that a reset code nobody was
sent does not work, and that a made-up Google token is refused.

---

## Part 8. Running it all from the terminal

Postman's command-line runner, Newman, runs the same collection without the app, which is
quicker for checking that nothing broke after a change. From the project folder, with the
API running:

```bash
npx newman run docs/postman/MzaziCare.postman_collection.json \
  -e docs/postman/MzaziCare.local.postman_environment.json \
  --folder "0. Is it running" \
  --folder "1. Sign in" \
  --folder "2. An emergency, start to finish" \
  --folder "3. Declining moves it on" \
  --folder "4. Withdrawing and reopening" \
  --folder "7. Where an elder is staying" \
  --folder "8. Reporting" \
  --folder "8d. Accounts (administrator)" \
  --folder "9. Things that must be refused"
```

The first time, `npx` asks to install Newman; answer `y`. Folders 5 and 6 are left out
because they need a code typed in by hand, and 6b, 8b and 8c with them, because they use the
account and elder made there.

At the end it prints a table. Every row in the **failed** column should be 0.

---

## Part 9. Live updates

The console's live board uses Socket.IO, and Postman can listen to it too.

1. Click **New → Socket.IO**.
2. In the address bar, type `http://localhost:3000/realtime?token=` and paste the
   administrator's token after the `=`. Copy it from `adminToken` under the eye icon.
3. Open **Settings** and set **Client version** to **v4**.
4. Open the **Events** tab, add `emergency.updated`, and switch **Listen** on.
5. Click **Connect**.
6. Now run folder 2 from the collection. A message arrives for every change to the
   alert.

A caregiver's token receives only the emergencies that caregiver is part of. A missing or
expired token is disconnected straight away.

---

## Part 10. When an answer is not what you expected

| Answer | Usually means |
| --- | --- |
| `Could not send request`, `ECONNREFUSED` | The API is not running |
| `401 Unauthorized` | The token expired. Run **1. Sign in** again |
| `403 Forbidden` | That account is not allowed to do that, which is often the point |
| `404 Not Found` on an alert | The account is not part of it. The API says 404 rather than 403, so it never confirms that an alert exists |
| `409 Conflict` | The state does not allow it: already acknowledged, already closed, outside the grace window, or the family place is taken |
| `400 Bad Request` | The body is wrong. The `message` names the field |
| `429 Too Many Requests` | A rate limit. Wait, or see below |

**Rate limits.** Sign-in allows 20 attempts in 5 minutes and sign-up codes 10 an hour from
one address. A full run of the collection signs in about nine times, and the app and the
console count too, so running it two or three times in a row reaches the limit and **1.
Sign in** starts answering `429`. Clear the counters and carry on, with no restart:

```bash
npm run dev:clear-limits -w @mzazicare/api
```

It only touches a Redis on your own machine, and only the counters. For a very long
session you can instead add `RATE_LIMIT_ENABLED=false` to `backend/.env` and restart the
API; take it out again afterwards.

**1. Sign in fails for one account with `401`.** Open the response: if it says the account
has been deactivated, or the password is wrong, a test account was changed while testing
(the console's Users page, or a password reset in the app). Re-seeding puts every test
account back as it should be, with the shared password, active and signed out:

```bash
npm run db:seed -w @mzazicare/api
```

Then run **1. Sign in** again.

**Keep tokens out of the repository.** Postman keeps the tokens it saves as local
"current values" on your machine. If you ever export the environment again, do not commit
the export over the one in `docs/postman/`: it would contain live tokens.

---

## Other ways to test

- **The automated suites** are described in [testing.md](testing.md). The unit tests
  (`npm test`) run without the API; the integration suite needs Docker.
- **curl** works for a one-off check without Postman:
  ```bash
  curl -s http://localhost:3000/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"phone":"+254700000020","password":"Dev!2026"}'
  ```
- **Every endpoint**, with who may call it, is listed in [api.md](api.md).
