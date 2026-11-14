# Decisions: The elder's experience

The help button, the ten seconds, voice, no connection, and the daily check-in.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## Hands-free activation is future work, and the obstacle is not recognition

**Later:** the assistant route described at the end was taken in November 2026. See
[Saying it: Siri, the widget, and speaking after the press](#saying-it-siri-the-widget-and-speaking-after-the-press).
The app still has no wake word of its own, for the reasons below.

A voice trigger, where calling out in a local language raises an alert, was assessed and
deferred. The finding is worth recording because it is counterintuitive.

Recognising one fixed word in any language is tractable. A keyword spotter trains on
recordings of the word, not on a language model, so an unsupported language is not the
barrier; custom wake words are routinely trained for languages no product ships.

The barrier is always-on listening. iOS gives a third-party app no sanctioned way to hold
the microphone open in the background, and Android can do it only with a foreground
service, a permanent notification and a battery exemption, which OEM power management will
still defeat. So the version people imagine, a phone in a drawer that hears someone call
out, is not deliverable on iOS at all.

If it is revisited, the two routes worth taking are an assistant integration, which
borrows the always-on wake word the platform already runs and costs about a day, and an
on-device keyword spotter evaluated properly, where the contribution is the measurement
rather than the feature: false accepts per hour matter more than accuracy for an emergency
system, because an alert nobody meant to raise erodes trust faster than a missed one does.

## No connection is a state of the elder's screen, not an error on it

When the press cannot reach the server, the screen says so in plain words ("Not sent
yet"), shows the elder's address, and offers the other ways to ask:

1. text HELP to MzaziCare, which escalates through the whole chain;
2. text the family directly, which reaches them even when MzaziCare cannot;
3. call the first carer or 999.

The help button is not offered again, because pressing it again would fail the same way
and teach the elder that it does not work. Each way opens the phone's own messages app
or dialler with everything filled in, so it is two presses, this one and send. The app
never sends a text itself: that would need the SMS permission, which Google Play allows
only for default messaging apps, and it would take the last word away from the person
holding the phone.

The alert is tried again every 15 seconds in the background. Before each try the app
asks for an open emergency first, so an alert that a HELP text already raised is picked
up rather than raised twice. When one goes through, the elder gets the usual ten
seconds to stop it, since they may have reached somebody another way meanwhile.

The carers' numbers and the shortcode are fetched whenever the app opens with a
connection and kept on the phone, in the Keychain or Keystore like the session, because
they are other people's numbers. They are cleared at sign-out. The address on this
screen is the registered home from the session; the phone is still never asked where it
is.

The direct text to the family bypasses the escalation and the audit log. That is the
cost of a route that works when MzaziCare cannot be reached, and it is why texting
MzaziCare comes first whenever it is available.

## The ten seconds are felt and seen, and the alert still goes at the press

Apple's and Android's emergency SOS count down before they call, and nothing leaves the
phone until the count ends. That pattern was considered and not followed: the alert
goes to the first tier at the press, for the reason in "An escalated alert can still be
cancelled inside the window" and in `AlertsService.create`. Ten seconds on every real
emergency is a worse trade than an occasional withdrawn one.

What was taken from them is how the countdown is told. The screen turns caution yellow,
the seconds left sit inside a ring that empties, and the phone taps lightly once a
second. That is three channels for whoever is holding the phone, so it can be followed
without reading and felt with the phone face down. The way out, **I am all right, stop
this**, sits at the bottom in the darkest ink on the screen. It is not red, because
stopping an alert is not an emergency.

## The help button becomes the countdown in the same place

Personal-safety apps tend to put their SOS control low on the screen, in easy reach of a
thumb, and for a while the help button moved to the bottom for that reason. It went back
to the middle, for continuity: the elder's screen
replaces what was pressed with what happened next, in place. A button at the bottom broke
that, because the eye had to jump from the bottom of the screen to its centre at the
moment of pressing.

It then went one step further: the help button and the countdown's ring are now the same
size in exactly the same place, so the press turns the red disc into the ring where it
was. They share one layout and one sizing rule. The band above the circle is held at the
height of the taller of the countdown's heading ("Help is on the way" and its sentence)
and the button's explanation, and the band below at the height of the countdown's way
out, all measured from the real text at the phone's width and text size, so the circle's
slot is the same on both screens.

The button's explanation sits above it, just over the circle, rather than underneath. It
is read before the press rather than after it, and in the same place the countdown's
heading is read next, so the words change where the eye already is, as the circle does.
It also leaves the band under the circle with nothing in it but the countdown's way out,
so the circle can be larger: about 260 points on a 360-wide Android phone and 345 on a
6.1 inch iPhone. The cost is that the button sits a little below the centre, a little
more at large text sizes, where the words above it take more of the screen. On the smallest phones, where the words would leave a circle under 144 points,
the screen scrolls rather than shrinking the button further. The one thing that can still
shift the circle on the idle screen is a check-in question or an error above the button.

Everything the elder does after pressing is at the bottom: stopping an alert, the ways to
ask without a connection, going back to the button. The one exception is **stop trying**,
which undoes something and so is kept away from the thumb.

## A daily check-in is opt-in twice, and a missed one is an ordinary alert

The panic button only helps an elder who can press it. A check-in covers the case it
cannot: once or twice a day the elder is asked "are you all right?", and if nobody
answers, the care circle is told. Products that already do this for older people living
alone, such as daily call services and wellness check-in apps, do it the same way: a
fixed time, one easy answer, and a person called when the answer does not come.

It is off until somebody turns it on, and when anybody other than the elder does, nothing
is asked until the elder agrees on their own phone. A check-in is a form of watching, and
the people being watched are the ones who decide that. Changing the times asks again for
the same reason. Turning it off is never held up by anybody's agreement. At most three
times a day: past that it stops being a check-in and becomes supervision.

A missed check-in is not a new kind of emergency with its own machinery. It is an alert
raised through the same path as a press of the button, so the chain, the timers, the
texts, the replies, the console and the audit trail all apply without a second copy of
any of them. What differs is said rather than built: the alert carries
`trigger: MISSED_CHECK_IN`, its messages say "did not answer today's check-in" and ask for
a call first, and it is held at the standard band. Somebody who slept through a reminder
is the common case, and the critical band's "everybody at once" would teach the circle to
ignore these.

A late answer withdraws the alert only while nobody has taken it on. Once somebody is on
their way the answer is recorded on the alert and they still go, because "I am all right"
pressed late is exactly what a check-in cannot vouch for. A press of the help button can
never be withdrawn this way. A reply to the check-in text is read the same way, and only a
1 counts: anything else from an elder is answered with how to get help, never taken as a
call for it.

The clock is a one-minute interval reading the database, not a Redis key per check-in. A
check-in is a time of day, a minute late is nothing for this question, and everything the
clock acts on is in the database, so a restart loses nothing. Each step is a conditional
write (one check-in per elder per time, pending to missed once), so a second API instance
does nothing twice. Times are kept as minutes after midnight in the elder's time zone and
turned into instants each day, so the clocks changing elsewhere, or an elder travelling,
does not move nine in the morning.

## Saying it: Siri, the widget, and speaking after the press

On 8 November 2026 an elder could ask for help, and say what is happening, without
finding the button or reading a list.

**"MzaziCare help fire" chooses Fire, and the fire service follows.** Siri hears the
phrase on the phone (App Shortcuts, nothing to set up) and opens the app with the type,
which raises the alert as the button does, countdown and all, and reports the type at
once. The service is asked after the same 25 seconds as a tap, so a mistake can still be
stopped or changed. Every type works the same way, in English and Swahili ("MzaziCare
msaada moto"). Android has no equal to App Shortcuts that takes words after the name, so
it has a home-screen Help button, a quick-settings tile, launcher shortcuts for each type
and the Assistant's "open fire in MzaziCare".

**One word list for everything said or written.** HELP texts, speech and later replies
read the same English, Swahili and Sheng lists (`shared/language`), on our own server.
Rules rather than a language model, because a safety decision has to be readable, testable
and correctable by the people running it, and because nothing said needs to leave the
server to be understood.

**Speech never lowers anything.** What is heard is reported only when nothing was, or
when it is more urgent than what was: "nimeanguka" after Fire was tapped is kept as what
was heard, not reported. Asking a service follows only from a reported type, as for a tap.

**Under the Data Protection Act.** The recording is personal data, often about health.
So: its own consent (`VOICE_REPORTS`), never part of registration; our own speech server
(Whisper, run in Docker), so nothing said goes to a company abroad; the recording deleted
once written down and never stored; the words kept 30 days (`SPEECH_RETENTION_DAYS`) for
the people helping, and the trail keeps only the language and what was heard. A data
protection impact assessment should cover this with the medical details.

**iOS 17 for Siri.** Siri's other words for each type ("moto", "nimeanguka") need iOS
17, and Xcode reads them when building, so the phrases are offered from iOS 17. On iOS 15
and 16 the app works as before, without them.

**Not verified here.** The Swift for Siri and the Kotlin for the widget, tile and
shortcuts could not be compiled where they were written; they need a build on a Mac and a
phone. The speech server was tested with a stand-in that answers as Whisper does, because
the model could not be downloaded there.

## Check-ins through the day, and each elder's rhythm

On 9 November 2026 a check-in could be every hour from 08:00 to 20:00, and learned when
an elder's silence is unusual.

**Every so often, as a list of times.** An interval is stored as the times it works out to,
with the step and the window kept beside them, so the one-minute clock, the agreement and
the history are unchanged. The time to answer must be shorter than the step: two
check-ins waiting at once would be one too many questions for an elder.

**A rhythm can only make a reminder sooner.** The reminder used to go half way through the
time to answer. For an elder who always answers within two minutes, ten minutes of
silence is already unusual, so the reminder now goes at twice their slow answer, at least
five minutes in, and never later than half way. Five answers before the rhythm is trusted;
fewer, and the fixed rule stands. The alert itself is never earlier or later than the
deadline the elder agreed to.

**A weekly note, not an alarm.** Answers drifting later, or more missed, can be the first
sign of somebody becoming unwell, and is worth a call before it is an emergency. Once a
week, on Monday morning on the elder's clock, the week is compared with the four before
it, and only a clear change (ten minutes later and twice as late, or two or more missed
and twice the share) texts their caregivers. A normal week sends nothing.
