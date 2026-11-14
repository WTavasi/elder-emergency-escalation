# Feature tour

Everything the system offers, screen by screen. The screenshots are the app and the
console as they are now, running against the seeded demonstration data. For how it works
underneath, see the [overview](overview.md).

- [Signing in](#signing-in)
- [For the elder](#for-the-elder)
- [For caregivers, family and responders](#for-caregivers-family-and-responders)
- [For community volunteers](#for-community-volunteers)
- [For administrators: the console](#for-administrators-the-console)
- [Light and dark](#light-and-dark)

## Signing in

<table>
<tr>
<td align="center"><img src="images/app/sign-in.png" width="200" alt="Sign in with a phone number"><br><sub>Phone number first</sub></td>
<td align="center"><img src="images/app/sign-in-password.png" width="200" alt="Enter your password"><br><sub>Then the password</sub></td>
<td align="center"><img src="images/app/sign-in-code.png" width="200" alt="Sign in with a code"><br><sub>Elders can use a code instead</sub></td>
</tr>
</table>

- Everybody signs in with a phone number. Sign-up proves the number with a texted code.
- An elder does not need a password: a code is texted to their phone, or their caregiver
  reads one out from their own app.
- An elder stays signed in, so the help button is there when the app opens.

Why: [accounts and security decisions](decisions/accounts-and-security.md).

## For the elder

The elder's side of the app has one job. It runs in Elder mode, with larger text and
bigger buttons, until the elder turns that off.

### Asking for help

<table>
<tr>
<td align="center"><img src="images/app/elder-home.png" width="200" alt="The help button"><br><sub>1. One button</sub></td>
<td align="center"><img src="images/app/elder-countdown.png" width="200" alt="Ten seconds to stop the alert"><br><sub>2. Ten seconds to stop a mistake</sub></td>
<td align="center"><img src="images/app/elder-told-family.png" width="200" alt="We've told your family"><br><sub>3. The family has been told</sub></td>
<td align="center"><img src="images/app/elder-help-coming.png" width="200" alt="Mary Otieno is coming"><br><sub>4. Who is coming, and how far away</sub></td>
</tr>
</table>

- The alert is sent at the press. The yellow screen is the chance to stop it, with a ring
  that empties and a tap from the phone each second.
- Sent, Coming, Here: three steps the elder can follow without reading much.
- When the helper shares their way there, the elder sees how many minutes away they are.

### Stopping it, and saying what is happening

<table>
<tr>
<td align="center"><img src="images/app/elder-stopped.png" width="200" alt="Alert stopped"><br><sub>Stopped: the family is told the elder is OK</sub></td>
<td align="center"><img src="images/app/elder-whats-happening.png" width="200" alt="What's happening?"><br><sub>Five things it could be</sub></td>
<td align="center"><img src="images/app/elder-said-unwell.png" width="200" alt="Your family can see: I feel unwell"><br><sub>What the family can now see</sub></td>
</tr>
</table>

- Saying what is happening is offered only after the alert has gone, so it never delays it.
- Fire, "I'm not safe" and chest pain or breathing ask the fire service, the police or an
  ambulance about 25 seconds later. A mistaken tap can be changed first.
- With the elder's consent and a speech server set up, the elder can say it out loud
  instead, in English or Swahili. See [voice](#voice) below.

### The elder's own page

<table>
<tr>
<td align="center"><img src="images/app/elder-me.png" width="200" alt="Me: call your people"><br><sub>Call anybody in the circle</sub></td>
<td align="center"><img src="images/app/elder-chain.png" width="200" alt="Medical details and help nearby"><br><sub>Medical details, and help nearby</sub></td>
<td align="center"><img src="images/app/elder-help-nearby.png" width="200" alt="Emergency services near you"><br><sub>The services that would be asked</sub></td>
<td align="center"><img src="images/app/elder-settings.png" width="200" alt="Display and privacy settings"><br><sub>Display, privacy and sign out</sub></td>
</tr>
</table>

- **Call your people** lists the chain in the order the help button asks them.
- **Help nearby** shows the response unit, ambulance, police and fire station closest to
  home, with the road time from each.
- **Privacy and consent** shows what was agreed on the elder's behalf. The elder confirms
  it, and can withdraw any part.

### Without a connection

When the phone has no data, the home screen says so and offers three other ways: text
HELP to the MzaziCare shortcode, text the family directly, or call. The app keeps trying
to send the alert in the background. A HELP text can carry what is happening ("msaada
moto") and raises the same alert on the server.

### Voice

- **Raising the alert.** On an iPhone (iOS 17 or later): "Hey Siri, MzaziCare help", or
  "MzaziCare help fire". On Android: a home-screen button, a quick-settings tile, and the
  Assistant. All of them open the app and run the same countdown as the button.
- **Saying what is happening.** After the press, up to a minute of speech is written down
  by a Whisper server the project runs itself. Word lists in English, Swahili and Sheng
  pick the type. The recording is deleted; the words are kept for 30 days.

Limits: the Siri and Android code has not been tried on real phones. See
[results](results.md#what-these-results-do-not-show).

### Daily check-ins

Optional. A caregiver proposes times, the elder agrees, and the app asks "Are you all
right?" at each. One tap answers. A reminder goes if the answer is late, and a missed
check-in raises an ordinary alert. The system learns each elder's usual answering time
only to send the reminder sooner, never to change the deadline.

### Talking through the app

During an emergency, the person helping can start a voice call through the app. The
elder's phone answers by itself on the speaker. This needs a LiveKit server; without one
the app says calls are not available and offers the phone's dialler.

Why: [the elder's experience decisions](decisions/elder-experience.md).

## For caregivers, family and responders

Everybody who answers alerts gets the same three tabs: Alerts, People and Me.

### An emergency, from the notification to the close

<table>
<tr>
<td align="center"><img src="images/app/carer-alerts-waiting.png" width="200" alt="One alert waiting for an answer"><br><sub>1. An alert is waiting</sub></td>
<td align="center"><img src="images/app/carer-alert.png" width="200" alt="The alert page"><br><sub>2. Who, how serious, what they said</sub></td>
<td align="center"><img src="images/app/carer-alert-medical.png" width="200" alt="Medical details on the alert"><br><sub>3. Medical details that matter now</sub></td>
<td align="center"><img src="images/app/carer-on-the-way.png" width="200" alt="On the way, sharing location"><br><sub>4. On the way</sub></td>
</tr>
<tr>
<td align="center"><img src="images/app/carer-arrived.png" width="200" alt="Help is there"><br><sub>5. Arrived</sub></td>
<td align="center"><img src="images/app/carer-closing.png" width="200" alt="How did it end?"><br><sub>6. How did it end?</sub></td>
<td align="center"><img src="images/app/carer-closed.png" width="200" alt="The closed emergency"><br><sub>7. Closed, with the record kept</sub></td>
<td></td>
</tr>
</table>

- **The list** puts the alert nobody is handling first and says why each row is where it
  is, including how far it is from the person looking.
- **The alert page** says in sentences who is being asked and whether anybody is coming.
  Three choices: "I'm on my way", "I cannot come", or call the elder.
- **"I cannot come"** moves the alert on at once. It never closes it.
- **A map** shows where the elder is and, once somebody is going, their route.
- **Medical details** appear only on an open alert the person was asked about, and only if
  the elder agreed. The elder can see who looked.
- **Sharing the way there** is the helper's choice. It tells the elder and the others how
  far away help is, and stops on arrival.
- **Asking a service.** The person helping can ask for an ambulance, the police or the
  fire service from the alert page.
- **Closing** asks what it was and how it ended, which also shows how often the elder's
  own report was right.

Without the app, or without data, the same people get a text message and can answer it:
1 to go, 2 if they cannot, or in their own words ("nakuja dakika kumi").

### The rest of their app

<table>
<tr>
<td align="center"><img src="images/app/carer-alerts-clear.png" width="200" alt="No open alerts"><br><sub>Nothing open</sub></td>
<td align="center"><img src="images/app/carer-history.png" width="200" alt="Alert history"><br><sub>History, searchable</sub></td>
<td align="center"><img src="images/app/carer-people.png" width="200" alt="The people they care for"><br><sub>The people they care for</sub></td>
<td align="center"><img src="images/app/carer-me.png" width="200" alt="The caregiver's own page"><br><sub>Their own page</sub></td>
</tr>
</table>

### Care circles

<table>
<tr>
<td align="center"><img src="images/app/carer-care-circles.png" width="200" alt="A caregiver's care circles"><br><sub>A caregiver, asked first for four elders</sub></td>
<td align="center"><img src="images/app/family-care-circles.png" width="200" alt="A family member's care circles"><br><sub>A family member, asked second</sub></td>
</tr>
</table>

- A caregiver adds an elder, sets their home by address search, and adds family by phone
  number. Somebody who has not signed up yet keeps their place until they do.
- A caregiver can change who is asked first. Everybody moved is told by text.
- A caregiver can record that the elder is staying somewhere else for a while, so helpers
  are sent to the right place.

Why: [care circle decisions](decisions/care-circle.md) and
[escalation decisions](decisions/escalation.md).

## For community volunteers

Vetted neighbours with a skill such as first aid. They apply in the app, an
administrator approves them, and they switch themselves available. For a critical alert,
or when the chain has nobody left, the nearest few are asked as well as the family, never
instead of them, and only for an elder who agreed to it. A volunteer learns who and where
only after saying they will go.

## For administrators: the console

A web application for the organisation running the service. It can see every emergency
and cannot act on one: only the people in an elder's circle can do that.

### Open emergencies, live

![The console's board of open emergencies](images/console/board.png)

The board updates as alerts arrive, change and close, with no refresh. The Live dot shows
whether the connection is up and says so when the API, the database or Redis is down.

### One emergency in full

![One emergency: state, severity, timeline and chain](images/console/emergency.png)

What happened, step by step, with times; who was asked and when; every message sent and
whether it was delivered; and "Why this severity?", which lists each factor's share of the
score.

### History and reporting

![History of emergencies](images/console/history.png)

![Reporting figures](images/console/reporting.png)

History filters by state, severity and time and exports to CSV. Reporting shows what is
open now, how quickly alerts were answered, how far up the chain they travelled, and the
share answered within the target time.

### Users and volunteers

![User management](images/console/users.png)

![Volunteer applications](images/console/volunteers.png)

Add and deactivate accounts, set a response unit's base address, and approve or suspend
volunteers.

### The escalation policy

![The escalation policy editor](images/console/policy.png)

How long each group has before the next is asked, the weight of each severity factor,
and where High and Critical start. Every change is checked (the last step can have no
time limit, Critical must stay reachable), recorded with the administrator's name, and
used from the next alert.

More: [the console's own guide](../frontend/dashboard/README.md).

## Light and dark

The app and the console follow the device's setting, and the person can choose
otherwise. The emergency colours stay the same in both.

<table>
<tr>
<td align="center"><img src="images/app/sign-in-dark.png" width="200" alt="Sign in, dark"></td>
<td align="center"><img src="images/app/elder-home-dark.png" width="200" alt="The help button, dark"></td>
<td align="center"><img src="images/app/carer-alerts-waiting-dark.png" width="200" alt="Alerts, dark"></td>
<td align="center"><img src="images/app/carer-alert-dark.png" width="200" alt="An alert with its map, dark"></td>
</tr>
</table>

![The console's board in dark mode](images/console/board-dark.png)

Why: [design decisions](decisions/design.md), [the design language](design-language.md).
