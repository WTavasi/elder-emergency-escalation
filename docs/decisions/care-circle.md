# Decisions: Care circles, responders and volunteers

Who is in an elder's circle, how they are added, and how helpers find their way.

Part of the [decision record](../README.md): choices that are not obvious from the code, with the
reasoning, so they can be defended or reversed on purpose.

## A caregiver adds family by phone number, and the place waits for them

A relative does not have to sign up before the caregiver can add them. If the number has
no account, its place in the chain is held in `chain_invitations` and taken, in the same
transaction, when that number signs up. Either way the person is sent an SMS saying who
added them and for whom, because finding out you are somebody's emergency contact during
the emergency is the wrong moment.

Until 28 October 2026 each rank held one person, enforced by the database from the start,
so a caregiver could add one relative and a second was refused. Now several people may
share a rank, and in practice that is the family rank: an elder's family is usually more
than one person, and asking only whichever child was added first left the others to hear
about it afterwards. Dispatch already told everybody at a rank, and a decline already
moved the emergency on only once everybody asked had declined, so the change was the
database rule and the check in front of it. Everybody at a rank is asked at the same
moment, the first to take it on owns it as before, and the rank waits its full window
while any of them might still answer. The one-to-one reading of "the family contact" in
the Chapter 4 narrative changes with it (`docs/schema-extensions.md`).

## An elder's home is found by address search, on the server

The elder's home needs coordinates, because alerts are placed there and responders are
given directions to it. Reading the caregiver's phone location while they stood at the
home would have been simplest, but it would have broken the rule that the app never
reads a device's location. So the caregiver searches for the address and picks from the
matches.

The search runs on the API against OpenStreetMap's Nominatim, not in the app, so the only
party that learns an elder's address is this system, and so the public service's usage
policy (https://operations.osmfoundation.org/policies/nominatim/) is kept in one place:
one request a second across all users, an identifying User-Agent with a contact, a day's
caching, searching on a button rather than as the person types, and the OpenStreetMap
attribution shown under the results. A deployment with real traffic should run its own
Nominatim or use a paid geocoder, which is one setting, `GEOCODER_URL`.

## Community volunteers go beside the chain, and learn who and where only by going

Professional responders cover parts of a city, and a family can be an hour away. In many
neighbourhoods the quickest help is a neighbour with first aid. Systems that already do
this, such as GoodSAM in the UK and PulsePoint in the US, alert trained volunteers within
a few hundred metres, and Kenya's Community Health Promoters are an existing pool of
exactly that kind of person.

Four decisions shape it.

**Vetted before anything is sent.** Anybody can sign up as a volunteer in the app, which
keeps joining easy, but nothing reaches them until an administrator approves the
application in the console's vetting queue. The training is declared and checked off
the system, by seeing a card or making a call; the system stores no certificate and no
ID number, because it does not need them to make the decision and keeping them would be
a liability. An administrator can suspend a volunteer at any time.

**A home area and a switch, not a tracked phone.** A volunteer sets the place they help
from (usually home) and how far they will go, from half a kilometre to five, and turns
"available" on when they can help. They are matched by that area. Reading the phone's
position would be more precise, but phones stop reporting in the background, so in
practice it would only work with the app open, and it would build a location trail of
private citizens. An area and a switch work with the app closed, by push or SMS, and
store nothing about where anybody is.

**Asked only when it adds something, and only for an elder who agreed.** Volunteers are
asked with a critical alert, from its first tier, and when an alert reaches the responder
tier where no professional responder covers the place. Not for every alert: a volunteer
asked about everything learns to ignore it. The elder (or their caregiver, which the
elder then confirms) must have agreed to it, recorded as a consent of its own, because
it means a stranger is told their name and address. Withdrawing that consent stops it.

**Beside the chain, never instead of it.** The first volunteer to accept is told who and
where, the rest are stood down, and the elder and the circle are told who is coming.
Accepting does not take the emergency on, stop a timer or change the emergency's state.
A volunteer is a stranger to the family, and nothing a stranger presses should stop the
family from being asked. The disclosure is also the price of going, not of being asked:
before accepting, a volunteer is told how far and how urgent only, and once the emergency
ends, the name and address disappear from their screen.

Volunteers are not participants in the emergency. They cannot open the emergency's
record, take it on, close it, join its voice room or share their way there; their routes
are their own, and the emergency's are refused to them as to anybody outside it.

## Road travel times, and a map in the app

Until now a time to the elder came from a router only when one was switched on, and
volunteers were ranked by the straight line from their area to the alert. In Nairobi the
straight line can mislead badly: across a river with one bridge, or a highway with one
crossing, the nearest on the map can be the furthest to reach. On 5 November 2026 roads
decide wherever distance does, and the app shows them.

**One router, shared.** The routing service moved out of the emergency module into
`shared/routing`, because the journeys of people on their way and the choice of
volunteers both need it and must not depend on each other. It answers one route, or
many places to one in a single OSRM table request. Every request shares one slot sized
to the router's limit (`ROUTING_RATE_PER_SECOND`, 1 for the public server, 0 for our
own). A journey never waits for the slot; choosing volunteers waits about a second at
most, then goes ahead on the straight line. Every answer says which it was.

**Volunteers by road distance, not time.** A volunteer may walk, ride a boda or drive,
and a driving time would be wrong for two of the three. Whose area contains the alert is
still the straight line, because the area is a circle the volunteer drew. Who is nearest
is measured along roads from the centre of each area, for the nearest few times the
number asked, in one request. The text says "about 1.8 km away by road", or the plain
distance when it was not measured.

**Not emergency responders, yet.** A responder account has a coverage area, not a base.
A road time from the middle of "Kileleshwa and Lavington" to the alert would look precise
and mean nothing. Ranking ambulances and stations by road needs each unit's base address
first; that is a small change to the responder form when the services join.

**Everybody on their way, on a map.** The person who took the emergency on and the
volunteer going can both share their way there, each under their own key, so neither
overwrites the other. Each journey carries the road from where they were last routed, as
a simplified line of points, for the map. The care circle sees a small map under Where:
the elder's place, each person on their way, and their road. Tapping it opens the map
full screen, where it moves; a small map that panned inside a scrolling page would fight
the scroll. The volunteer sees the elder's place and their own way there once they have
said they will go, and nothing before. The elder sees times, never positions.

**OpenStreetMap, drawn by flutter_map.** No map SDK, no API key and no account with a
mapping company, as the project owner chose. OpenStreetMap's own map pictures are used
at this scale, with the credit in the corner and an identifying User-Agent, as its
policy asks; `MAP_TILES_URL` moves to a provider when traffic grows. A straight-line
estimate draws no road, rather than a line across buildings that nobody worked out.

**Spoken directions stay with the maps apps.** Turn-by-turn navigation is a product of
its own, and Google Maps and Apple Maps do it far better than this app could. "Get
directions" opens Google Maps, and on an iPhone offers Apple Maps first.

**Our own router in production.** The public OSRM server is for trying things out. The
project's own (`infra/osrm`) is the official OSRM image with Kenya's map prepared inside
it when built, so it starts in seconds and needs nothing from outside to answer. It runs
as its own service beside the API.
