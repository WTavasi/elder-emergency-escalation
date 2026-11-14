# Decisions: Reaching people: push, texts, calls and live updates

How messages get to people, and what happens when they cannot.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## Provider failure has two kinds, and the difference is load-bearing

A permanent failure returns `delivered: false` and the caller moves straight to SMS. A
transient failure throws and the job retries. Getting this backwards either burns three
retries on a dead device token while somebody waits, or gives up on a working one.

## Waiting on a provider is bounded

Node's `fetch` has no default timeout. A connection that opened and then stalled would
hold a queued notification until its lock expired minutes later, which in an emergency
means nothing is sent and nothing is reported.

Both providers now have a deadline. A timeout throws, which the processor reads as
transient and retries, and that is the right reading: a gateway that did not answer in
time may answer the next attempt. The push timeout bounds the wait rather than
cancelling the request, because Firebase's client offers no way to cancel, so a retry
after a timeout can produce a duplicate. For an emergency alert that is the right
trade: a duplicate is an annoyance, a job blocked on a dead socket is an alert nobody
receives.

## The socket carries changes, not truth

Every screen loads over HTTP first and treats a socket message as a reason to update
what it already has. A dropped connection therefore degrades the dashboard to a
slightly stale one rather than an empty one, and the connection state is shown, because
an operator has to be able to tell "nothing is happening" apart from "I am no longer
being told what is happening".

Publishing is fire and forget. An escalation that failed because a socket was
unavailable would be a real emergency lost to a cosmetic feature.

## The app is told about changes by socket and by push, and still polls

The socket gives the app the console's speed. Push reaches a phone whose app is closed,
and also arrives while it is open, so both feed the same hub and a screen does not care
which spoke first. Neither replaces polling: a socket that reconnects does not replay
what it missed, and a push can be delayed or dropped by the phone. The poll slows to
every 30 seconds while the socket is up, which keeps a phone through a development
tunnel well inside the free plan's request allowance, and returns to its old pace when
the socket is down.

The Firebase project is given to the app as build defines rather than as
`google-services.json` and `GoogleService-Info.plist`. Nothing needs adding to Gradle,
no configuration file can be committed by mistake, and a build without a project is the
same build with push switched off: it never asks for notification permission.

The server keeps one push address per account and moves an address to whoever
registered it last, so a phone passed from one person to another never shows the first
person's emergencies. Signing out clears it.

## An alert can be answered by replying to its text

A caregiver with the app answers in the app. The person this is for is the one without
it: a family member on a basic phone, somebody out of data, a responder whose push did
not arrive. For them the alert SMS was a dead end that said "please respond" and offered
no way to. Now it ends "Reply 1 if you can go, 2 if you cannot", and the reply does what
the two buttons do.

A reply goes through the same acknowledge and decline as the app, not a parallel path.
So the rules those enforce hold for a text without being written twice: only somebody who
was asked can answer, the first to accept owns the emergency (the same conditional write
settles a text and a tap arriving together), declining is limited to the tier being
asked, and nothing a reply does can close an emergency.

The sender is identified by their number alone. The gateway reports it, and the secret in
the callback address is what shows the request came from the gateway. That is weaker than
a signed-in session, and acceptable for what a reply can do: accept or decline an
emergency the number was itself sent. A number that belongs to nobody gets no answer, so
the address cannot be used to learn who is registered or to run up a bill, and each phone
is limited to six replies in ten minutes.

Digits rather than words, because they are the same in English and Swahili and on every
keypad; the common words are read too, since people type them anyway. A reply is matched
to the newest alert still waiting on that person rather than carrying a reference,
because a reference is one more thing to get wrong on a small keypad, and two alerts
waiting on the same person at once is rare enough to accept the cost: they are told which
elder they answered for.

Replying is off unless `SMS_INBOUND_TOKEN` is set, and the alert only offers it when it
is, so nobody is told to reply to a number that ignores them. Two-way SMS needs a
shortcode. The sandbox gives one free with its simulator, which is what the demonstration
uses; a live shortcode is rented, which is a deployment cost rather than a design change.

## An elder with no data can text HELP

The help button needs the internet. In Kenya a phone with airtime but no data bundle is
ordinary, and so is a weak signal that carries a text but not a request. Before this, an
elder in that position pressed the button, read a socket error, and had nothing else to
press. A text of "help" was deliberately answered with instructions, so that a mistyped
reply to a check-in could not become an emergency.

HELP from an elder's number now raises the same alert the button does, through the same
code. SOS, MSAADA and SAIDIA are read too, because that is what a frightened person types
in English and Swahili. The risk the old rule guarded against is kept small in two ways.
Only the first word is read, so a sentence that merely mentions help further in does
nothing. And only an elder's number can raise one, because a responder replying "help"
is asking a question, not reporting an emergency.

Three details were decided rather than inherited:

- **No cancel window.** A text cannot be withdrawn, so the severity is scored once and
  never reviewed. Reviewing it would count "did not cancel" in full, the factor that
  reads as "may not be able to reach the phone", for somebody who has just used it. The
  stored reasoning says "no cancel window: raised by text" rather than calling a window
  open that never was, as it does for a missed check-in.
- **One emergency at a time.** A second HELP, or the gateway retrying the first, while one
  is open is answered with who is coming rather than raising another.
- **The app only offers it when it will be read.** The shortcode reaches the app through
  the elder's profile only when both `AT_SHORTCODE` and `SMS_INBOUND_TOKEN` are set.
  Telling somebody to text a number nothing listens on is worse than not offering it,
  because they would wait for an answer that never comes.

## Talking to the elder goes through the app, and the elder's phone joins by itself

A phone call needs the person called to reach the phone and answer it. For an elder who
has fallen, or cannot get up, that is the step most likely to fail. So a responder can
start a call inside the app, and the elder's phone, already open on the emergency it
raised, joins on its own on the speaker. It says who is joining and buzzes for three
seconds first, with "Not now" to stop it, so the first thing the elder hears is not a
surprise; the responder's screen asks them to say who they are first. A large "End
call" is there for the whole call.

Opening a microphone without a press is the sharpest edge of this, so it is narrow. It
happens only during an emergency the elder raised, only after somebody in their circle
(the same participant rule as every button) asked to talk, only while the emergency is
open, and every join is audited with who and when. The token allows the microphone and
one room and nothing else. Nothing said is recorded, and the audio does not pass through
this server.

LiveKit carries the audio: an open-source WebRTC server, used here through LiveKit
Cloud's free plan, with a local development server as the offline option. Its access
token is a JWT signed with the project secret, so the API signs it with the JWT library
it already has rather than adding a dependency for one token.

The tone the plan described became a buzz and words on the screen. Flutter's system alert
sound only plays on desktop operating systems, and a recorded chime would need an audio
player whose audio session then has to be handed to the call. The buzz, the large text
and the responder speaking first do the same job.

The fallback is ringing with the phone's own dialler, which every alert already offers.
An Africa's Talking conference call, which would reach a phone that was locked or had
the app closed, does not work in their sandbox and needs a purchased voice number, so it
is future work rather than part of this build.

## Replies in their own words

On 10 November 2026 a text reply was read for what it meant, not only its first word.

**Rules on our own server, in three languages.** English, Swahili and Sheng word lists
(`shared/language/replies.ts`), the same approach as the emergency words: readable,
testable and correctable, and nothing anybody writes leaves the server to be understood.
`1` and `2` still win. "No problem" and "hakuna shida" are yes, though they carry a no.

**Unsure means asking back.** A reply that says yes and no ("siwezi sasa, nitakuja
baadaye"), or neither, is not guessed at: the person is sent the two answers again. A
wrong yes would stop the chain for somebody who is not coming; a wrong no would skip
somebody who is.

**How soon, when they say.** "Nakuja dakika kumi", "nusu saa", "baada ya saa moja", "in
5". A bare "saa mbili" is left alone, because it is eight o'clock as well as two hours.
The time is kept on the alert and shown to the elder when the person coming is not sharing
their way there; a shared way there, measured by road, wins over what was said.
