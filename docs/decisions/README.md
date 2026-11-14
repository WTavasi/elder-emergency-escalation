# Decisions

Choices that are not obvious from the code, with the reasoning, so they can be defended
or reversed on purpose rather than drifted away from by accident.

They are grouped by topic. Each entry says what was decided and why. Where a later decision
replaced an earlier one, the earlier entry says so.

## [Severity and escalation](escalation.md)

How an alert is scored, who is asked, in what order, and when it moves on.

- [The severity policy is a weighted rule, not machine learning](escalation.md#the-severity-policy-is-a-weighted-rule-not-machine-learning)
- [Caregiver cover was dropped as a severity factor](escalation.md#caregiver-cover-was-dropped-as-a-severity-factor)
- [An escalated alert can still be cancelled inside the window](escalation.md#an-escalated-alert-can-still-be-cancelled-inside-the-window)
- [Escalation timing is event-driven, not polled](escalation.md#escalation-timing-is-event-driven-not-polled)
- [Declining escalates immediately, but never closes an emergency](escalation.md#declining-escalates-immediately-but-never-closes-an-emergency)
- [Ownership is claimed by a conditional write](escalation.md#ownership-is-claimed-by-a-conditional-write)
- [Escalation has two mechanisms, and the second one exists for deployment](escalation.md#escalation-has-two-mechanisms-and-the-second-one-exists-for-deployment)
- [Saying what is happening, and asking the right service](escalation.md#saying-what-is-happening-and-asking-the-right-service)
- [Stations nearest first, and who to go to first](escalation.md#stations-nearest-first-and-who-to-go-to-first)
- [The policy editor, who is asked first, and several phones per account](escalation.md#the-policy-editor-who-is-asked-first-and-several-phones-per-account)

## [Reaching people: push, texts, calls and live updates](reaching-people.md)

How messages get to people, and what happens when they cannot.

- [Provider failure has two kinds, and the difference is load-bearing](reaching-people.md#provider-failure-has-two-kinds-and-the-difference-is-load-bearing)
- [Waiting on a provider is bounded](reaching-people.md#waiting-on-a-provider-is-bounded)
- [The socket carries changes, not truth](reaching-people.md#the-socket-carries-changes-not-truth)
- [The app is told about changes by socket and by push, and still polls](reaching-people.md#the-app-is-told-about-changes-by-socket-and-by-push-and-still-polls)
- [An alert can be answered by replying to its text](reaching-people.md#an-alert-can-be-answered-by-replying-to-its-text)
- [An elder with no data can text HELP](reaching-people.md#an-elder-with-no-data-can-text-help)
- [Talking to the elder goes through the app, and the elder's phone joins by itself](reaching-people.md#talking-to-the-elder-goes-through-the-app-and-the-elders-phone-joins-by-itself)
- [Replies in their own words](reaching-people.md#replies-in-their-own-words)

## [The elder's experience](elder-experience.md)

The help button, the ten seconds, voice, no connection, and the daily check-in.

- [Hands-free activation is future work, and the obstacle is not recognition](elder-experience.md#hands-free-activation-is-future-work-and-the-obstacle-is-not-recognition)
- [No connection is a state of the elder's screen, not an error on it](elder-experience.md#no-connection-is-a-state-of-the-elders-screen-not-an-error-on-it)
- [The ten seconds are felt and seen, and the alert still goes at the press](elder-experience.md#the-ten-seconds-are-felt-and-seen-and-the-alert-still-goes-at-the-press)
- [The help button becomes the countdown in the same place](elder-experience.md#the-help-button-becomes-the-countdown-in-the-same-place)
- [A daily check-in is opt-in twice, and a missed one is an ordinary alert](elder-experience.md#a-daily-check-in-is-opt-in-twice-and-a-missed-one-is-an-ordinary-alert)
- [Saying it: Siri, the widget, and speaking after the press](elder-experience.md#saying-it-siri-the-widget-and-speaking-after-the-press)
- [Check-ins through the day, and each elder's rhythm](elder-experience.md#check-ins-through-the-day-and-each-elders-rhythm)

## [Care circles, responders and volunteers](care-circle.md)

Who is in an elder's circle, how they are added, and how helpers find their way.

- [A caregiver adds family by phone number, and the place waits for them](care-circle.md#a-caregiver-adds-family-by-phone-number-and-the-place-waits-for-them)
- [An elder's home is found by address search, on the server](care-circle.md#an-elders-home-is-found-by-address-search-on-the-server)
- [Community volunteers go beside the chain, and learn who and where only by going](care-circle.md#community-volunteers-go-beside-the-chain-and-learn-who-and-where-only-by-going)
- [Road travel times, and a map in the app](care-circle.md#road-travel-times-and-a-map-in-the-app)

## [Accounts and security](accounts-and-security.md)

Signing up, signing in, passwords, tokens and rate limits.

- [Passwords use scrypt from Node's own crypto module](accounts-and-security.md#passwords-use-scrypt-from-nodes-own-crypto-module)
- [Refresh tokens are stored as a fingerprint, and rotate](accounts-and-security.md#refresh-tokens-are-stored-as-a-fingerprint-and-rotate)
- [Rate limiting is counted in Redis, and is opt-in per route](accounts-and-security.md#rate-limiting-is-counted-in-redis-and-is-opt-in-per-route)
- [Sign-up proves the phone number with a code](accounts-and-security.md#sign-up-proves-the-phone-number-with-a-code)
- [Sign-up asks for two things at a time, and the small print stays small](accounts-and-security.md#sign-up-asks-for-two-things-at-a-time-and-the-small-print-stays-small)
- [Sign-in asks for the number first](accounts-and-security.md#sign-in-asks-for-the-number-first)
- [An elder stays signed in, and signing out is one step away from the panic button](accounts-and-security.md#an-elder-stays-signed-in-and-signing-out-is-one-step-away-from-the-panic-button)
- [An elder can sign in with a code, and nobody else can](accounts-and-security.md#an-elder-can-sign-in-with-a-code-and-nobody-else-can)

## [Privacy, consent and personal data](privacy.md)

Consent, location, medical details, retention and the privacy notice.

- [Retention is enforced, not just configured](privacy.md#retention-is-enforced-not-just-configured)
- [The server decides where an emergency is, and the app never reads the device](privacy.md#the-server-decides-where-an-emergency-is-and-the-app-never-reads-the-device)
- [Consent is confirmed by the elder, can be withdrawn, and never stands in front of help](privacy.md#consent-is-confirmed-by-the-elder-can-be-withdrawn-and-never-stands-in-front-of-help)
- [Somebody on the way shares it by choice, and only the arrival is kept](privacy.md#somebody-on-the-way-shares-it-by-choice-and-only-the-arrival-is-kept)
- [Medical details, under the Data Protection Act](privacy.md#medical-details-under-the-data-protection-act)
- [The privacy notice, November 2026](privacy.md#the-privacy-notice-november-2026)

## [Design of the app and the console](design.md)

Colour, type, wording and the conventions each screen follows.

- [Colour is defined once](design.md#colour-is-defined-once)
- [The fonts are bundled, and the elder's was chosen for legibility first](design.md#the-fonts-are-bundled-and-the-elders-was-chosen-for-legibility-first)
- [Light or dark is the person's choice, and the emergency colours are not](design.md#light-or-dark-is-the-persons-choice-and-the-emergency-colours-are-not)
- [The app follows Apple's conventions, and Elder mode is a switch](design.md#the-app-follows-apples-conventions-and-elder-mode-is-a-switch)
- [The console follows a Mac app, as the app follows an iPhone one](design.md#the-console-follows-a-mac-app-as-the-app-follows-an-iphone-one)
- [The app speaks in short, plain sentences](design.md#the-app-speaks-in-short-plain-sentences)
- [Rounded groups, the important part first, and buttons that look pressable](design.md#rounded-groups-the-important-part-first-and-buttons-that-look-pressable)
- [The console is live again, collapses to a rail, and the app's long pages stop jumping](design.md#the-console-is-live-again-collapses-to-a-rail-and-the-apps-long-pages-stop-jumping)

## [The console and running the system](console-and-operations.md)

What the administrator console may do, and how the system is configured.

- [The administrator console is read-only over emergencies](console-and-operations.md#the-administrator-console-is-read-only-over-emergencies)
- [Two environment files](console-and-operations.md#two-environment-files)
