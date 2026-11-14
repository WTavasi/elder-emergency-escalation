# Decisions: Accounts and security

Signing up, signing in, passwords, tokens and rate limits.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## Passwords use scrypt from Node's own crypto module

Not bcrypt or argon2. Both are native modules, and a native dependency is one more thing
that has to compile on every machine and in CI. scrypt is in the standard library, is
memory-hard, and its cost parameters are stored alongside each hash so raising them
invalidates nothing.

## Refresh tokens are stored as a fingerprint, and rotate

The database holds a SHA-256 of the current refresh token, never the token. A stolen
database yields no usable sessions. Presenting a token that verifies but no longer
matches the stored fingerprint means the token was replayed, so every session for that
user is revoked.

## Rate limiting is counted in Redis, and is opt-in per route

An in-memory limiter is only a limit while there is one instance of the API. The moment
the platform runs two, an attacker gets double the attempts and the limit quietly stops
being one. The Redis already running for escalation timers is the natural home.

Applied per route rather than globally, because the panic button is the one endpoint
where refusing a request could cost somebody their emergency. Sign-in is limited where
brute force is the threat; raising an alert is limited far above anything a frightened
person pressing repeatedly would reach, and only to stop a compromised account filling
the database.

If Redis is unreachable the request is allowed. The limit is a mitigation, not the
access control, and refusing every sign-in because Redis is down would turn a degraded
system into an unusable one.

## Sign-up proves the phone number with a code

Anybody could otherwise create an account with somebody else's number. That person could
then never sign up themselves, and could be put into an elder's chain they never agreed
to. So sign-up, and a caregiver registering an elder, both need a six-digit code sent by
SMS to the number being registered.

The code request answers the same whether or not the number already has an account, so
it cannot be used to discover who is registered. A registered number is sent a message
saying somebody tried, which tells the owner without telling the person asking. Codes
are kept in Redis as a salted hash, live ten minutes, allow five wrong guesses and work
once; one number gets at most five codes an hour, which keeps the SMS bill out of an
attacker's hands. Before this, registering a taken number answered "an account already
exists", which was a way to test whether somebody was registered; that answer is now only
reachable by somebody who holds the phone.

## Sign-up asks for two things at a time, and the small print stays small

The first sign-up screen had grown to fourteen things on one page: a notice, three role
buttons with icons, five fields, a panel on what is kept, two links, a tick box and the
button, which a 6.1 inch phone could not show without scrolling. It now follows the
phone-first sign-ups people already know from apps like WhatsApp, in two short steps.

- **Who you are and your number, then the code and a password.** Each screen holds three
  or four things. The password moved beside the code because it is needed at the same
  moment, when the account is made.
- **Only what an account cannot exist without.** The optional email went, since the
  account page already takes one, and so did "Password again". A show button lets a
  mistake be seen and put right in the field, which is what the second field was for.
- **Agreeing is the button.** "Agree and send a code" is the act of agreeing, with the
  terms of use and the privacy notice linked in one line of small print under it, in
  the sentence that says what pressing it means. It is still a deliberate press, unlike
  "by using this app", and the server still records `acceptedPrivacyNotice`. The summary
  of what MzaziCare keeps went with the tick box: the privacy notice says all of it, one
  tap away.
- **Words alone on the role buttons.** With icons beside them, the three no longer fit
  across a phone, and "Volunteer" broke in the middle of the word.

## Sign-in asks for the number first

Sign-in is two short steps too: the number on its own, then the password. There are two
ways in, a password or, for an elder, a code, and asking for the number first lets the
second screen offer both against the number already typed. The first screen holds one
field and one button, a line to make an account, and the privacy notice and terms in
small print; the rings behind it stay, since nothing is read on them.

The server cannot say which way suits a number without telling anybody who uses
MzaziCare, so the second step always offers both: the password, with **Forgot your
password?** just under the field where people look when it fails, and below it **Sign in
with a code** for elders. The cost is one more tap for everybody, and password managers
fill a form split across two screens less smoothly than one with both fields. Setting a
new password lost its second field for the same reason sign-up did, and every screen on
the way in now opens at the top with the same heading, so nothing jumps between steps.

## An elder stays signed in, and signing out is one step away from the panic button

Every other account's refresh token lasts 30 days, and a person who has not opened the
app for a month signs in again. For an elder that rule fails silently: the phone still
shows the button, the button no longer reaches anybody, and the elder may not remember a
password that somebody else set up. So an elder's refresh token lasts ten years
(`JWT_REFRESH_TTL_ELDER`), and every other protection still applies: it rotates on each
use, a replayed token ends every session, and deactivation ends it at once.

For the same reason the sign-out control left the elder's home screen. It sits on the
elder's own page, behind the round button at the top, at the bottom of that page, and
asks first, saying that the phone cannot ask for help while signed out.

Everybody else is asked the same way, with the same sheet at the bottom of their account
page, saying what it costs them: emergencies will not appear on this phone, and anybody
asked to help is sent a text instead. That is true because signing out forgets the
phone's push address, and both the chain and the volunteer messages fall back to a text
when there is none.

## An elder can sign in with a code, and nobody else can

An elder is usually registered by a caregiver, who chooses the password. After a sign-out,
a new phone or a reinstall, that password is the most likely thing to keep the elder from
the help button, and asking an elder to remember a password somebody else set is a poor
trade for the security it buys.

So an elder can sign in with a six-digit code instead, in either of two ways. One is sent
by text to their own number. The other is a pairing code their caregiver makes on the
elder's page in the app and types into the elder's phone, which suits the usual case of a
caregiver beside the elder setting up a phone. Both go into the same box. Each guess
counts against every code waiting, so two codes give no extra guesses, and a pairing
code lasts ten minutes and is never texted.

Nobody else can sign in this way. A code by text is only as safe as the SIM it reaches,
and everybody else chose their own password, so for them a text alone would weaken their
account for no gain.

Changing a phone number follows the same reasoning. The number is the sign-in handle and
the number every chain rings, so it changes only with a code sent to the new number,
after the current password for anybody who has one. An elder is not asked for the
password; the text sent to the old number afterwards is their safeguard, as it is for
everybody.
