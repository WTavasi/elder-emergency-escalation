import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/map/emergency_map.dart';

void main() {
  group('EventState', () {
    test('knows which states are still live', () {
      expect(EventState.triggered.isOpen, isTrue);
      expect(EventState.escalated.isOpen, isTrue);
      expect(EventState.acknowledged.isOpen, isTrue);
      expect(EventState.onScene.isOpen, isTrue);
      expect(EventState.resolved.isOpen, isFalse);
      expect(EventState.cancelled.isOpen, isFalse);
    });

    test('reads the state for somebody being with the elder', () {
      expect(EventState.parse('ON_SCENE'), EventState.onScene);
    });

    test('refuses a state it does not know rather than guessing one', () {
      // A server that starts sending a new state should stop this client loudly at the
      // boundary, not produce a screen that silently says nothing is happening.
      expect(() => EventState.parse('SOMETHING_NEW'), throwsFormatException);
    });
  });

  group('Emergency', () {
    test('accepts either field name the API uses for the id', () {
      // The create endpoint returns the raw row, whose field is `id`; the projections
      // call it `eventId`.
      final Map<String, dynamic> base = <String, dynamic>{
        'state': 'NOTIFIED',
        'severity': 'ELEVATED',
        'currentTier': 1,
        'triggeredAt': '2026-09-16T10:00:00.000Z',
      };

      expect(Emergency.fromJson(<String, dynamic>{...base, 'id': 'a'}).id, 'a');
      expect(Emergency.fromJson(<String, dynamic>{...base, 'eventId': 'b'}).id, 'b');
    });

    test('reads the owner name when somebody has taken responsibility', () {
      final Emergency emergency = Emergency.fromJson(<String, dynamic>{
        'id': 'a',
        'state': 'ACKNOWLEDGED',
        'severity': 'CRITICAL',
        'currentTier': 2,
        'triggeredAt': '2026-09-16T10:00:00.000Z',
        'acknowledgedBy': <String, dynamic>{'id': 'c', 'name': 'Mary Otieno', 'role': 'CAREGIVER'},
      });

      expect(emergency.acknowledgedByName, 'Mary Otieno');
    });
  });

  group('Account', () {
    test('reads an elder home, and survives a role that has none', () {
      final Account elder = Account.fromJson(<String, dynamic>{
        'id': 'e',
        'name': 'Grace',
        'phone': '+254700000010',
        'email': null,
        'role': 'ELDER',
        'home': <String, dynamic>{'latitude': -1.1, 'longitude': 36.8, 'addressLabel': 'Home'},
      });
      final Account carer = Account.fromJson(<String, dynamic>{
        'id': 'c',
        'name': 'Mary',
        'phone': '+254700000020',
        'email': null,
        'role': 'CAREGIVER',
        'home': null,
      });

      expect(elder.home?.latitude, -1.1);
      expect(carer.home, isNull);
    });

    test('survives a half location rather than sending a meaningless coordinate', () {
      final Account elder = Account.fromJson(<String, dynamic>{
        'id': 'e',
        'name': 'Grace',
        'phone': '+254700000010',
        'email': null,
        'role': 'ELDER',
        'home': <String, dynamic>{'latitude': -1.1, 'longitude': null},
      });

      expect(elder.home, isNull);
    });

    test('round-trips through storage', () {
      const Account original = Account(
        id: 'e',
        name: 'Grace',
        phone: '+254700000010',
        role: Role.elder,
        home: GeoPoint(latitude: -1.1, longitude: 36.8, addressLabel: 'Home'),
      );

      final Account restored = Account.fromJson(<String, dynamic>{
        ...original.toJson(),
        'email': null,
      });

      expect(restored.role, Role.elder);
      expect(restored.home?.addressLabel, 'Home');
    });
  });

  group('several on the way, and the road', () {
    Map<String, dynamic> journey(String traveller, int eta) => <String, dynamic>{
      'userId': '$traveller-1',
      'traveller': traveller,
      'etaSeconds': eta,
      'distanceMetres': 2000,
      'source': 'osrm',
      'updatedAt': '2026-11-05T10:00:00.000Z',
      'latitude': -1.29,
      'longitude': 36.79,
      'path': <List<Object>>[
        <num>[-1.29, 36.79],
        <num>[-1.285, 36.785],
        <String>['broken'],
      ],
    };

    test('reads everybody on the way, and their road, skipping a broken point', () {
      final List<Journey> all = Journey.listFromJson(<dynamic>[
        journey('volunteer', 240),
        journey('owner', 540),
        'not a journey',
      ]);

      expect(all.map((Journey j) => j.traveller), <Traveller>[
        Traveller.volunteer,
        Traveller.owner,
      ]);
      expect(all.first.path, hasLength(2));
      expect(all.first.path.last.latitude, -1.285);
    });

    test('an older server with only the owner still shows them', () {
      final List<Journey> all = Journey.listFromJson(null, orOnly: journey('owner', 540));
      expect(all.single.traveller, Traveller.owner);
    });

    test('the elder is told the volunteer\'s time when the volunteer is coming', () {
      final Emergency emergency = Emergency.fromJson(<String, dynamic>{
        'id': 'event-1',
        'state': 'NOTIFIED',
        'severity': 'ELEVATED',
        'currentTier': 1,
        'triggeredAt': '2026-11-05T10:00:00.000Z',
        'journeys': <dynamic>[journey('volunteer', 240)],
      });
      expect(emergency.volunteerJourney?.etaSeconds, 240);
      expect(emergency.journey, isNull);
    });

    test('a volunteer distance says when it is by road', () {
      expect(howFarAway(1840, byRoad: true), 'about 1.8 km away by road');
      expect(howFarAway(1240, byRoad: false), 'about 1.2 km away');
    });

    test('the map is said in words for a screen reader', () {
      const MapTraveller peter = MapTraveller(
        name: 'Peter Mwangi',
        at: MapPoint(-1.29, 36.79),
        etaSeconds: 540,
      );
      const MapTraveller you = MapTraveller(
        name: 'Joseph',
        at: MapPoint(-1.28, 36.78),
        etaSeconds: 60,
        isYou: true,
      );
      expect(describeMap('Grace', const <MapTraveller>[]), 'Map showing where Grace is.');
      expect(
        describeMap('Grace', const <MapTraveller>[peter, you]),
        'Map showing where Grace is, and Peter about 9 minutes away and you about 1 minute away.',
      );
    });

    test('no position, no pin: the elder\'s copy never reaches the map', () {
      final Journey? timeOnly = Journey.fromJson(<String, dynamic>{
        ...journey('owner', 540),
        'latitude': null,
        'longitude': null,
      });
      expect(MapTraveller.fromJourney(timeOnly!, 'Peter'), isNull);
    });
  });

  group('the way there', () {
    Map<String, dynamic> journey({bool withPosition = true}) => <String, dynamic>{
      'etaSeconds': 540,
      'distanceMetres': 4200,
      'source': 'estimate',
      'updatedAt': '2026-10-20T10:00:00.000Z',
      'latitude': withPosition ? -1.27 : null,
      'longitude': withPosition ? 36.82 : null,
    };

    test('the elder gets the time and arrival, and no position', () {
      final Emergency emergency = Emergency.fromJson(<String, dynamic>{
        'eventId': 'event-1',
        'state': 'ON_SCENE',
        'severity': 'ELEVATED',
        'currentTier': 1,
        'triggeredAt': '2026-10-20T09:50:00.000Z',
        'arrivedAt': '2026-10-20T10:05:00.000Z',
        'journey': journey(withPosition: false),
      });

      expect(emergency.state, EventState.onScene);
      expect(emergency.hasArrived, isTrue);
      expect(emergency.journey?.etaSeconds, 540);
      expect(emergency.journey?.byRoad, isFalse);
      expect(emergency.journey?.hasPosition, isFalse);
    });

    test('a summary says who owns it and when they arrived', () {
      final AlertSummary summary = AlertSummary.fromJson(<String, dynamic>{
        'eventId': 'event-1',
        'state': 'ON_SCENE',
        'severity': 'ELEVATED',
        'currentTier': 1,
        'triggeredAt': '2026-10-20T09:50:00.000Z',
        'acknowledgedBy': <String, dynamic>{'id': 'c1', 'name': 'Mary', 'role': 'CAREGIVER'},
        'arrivedAt': '2026-10-20T10:05:00.000Z',
      });

      expect(summary.ownerId, 'c1');
      expect(summary.arrivedAt, isNotNull);
    });

    test('a journey without its numbers is no journey at all', () {
      expect(Journey.fromJson(null), isNull);
      expect(Journey.fromJson(<String, dynamic>{'etaSeconds': 60}), isNull);
      expect(Journey.fromJson(journey())?.hasPosition, isTrue);
    });

    test('a position answer reads arriving and the time left', () {
      expect(PositionResult.fromJson(<String, dynamic>{'arrived': true}).arrived, isTrue);
      final PositionResult result = PositionResult.fromJson(<String, dynamic>{
        'arrived': false,
        'journey': journey(),
      });
      expect(result.journey?.distanceMetres, 4200);
    });

    test('only the people who take emergencies on can share a way there', () {
      expect(Role.caregiver.responds, isTrue);
      expect(Role.familyMember.responds, isTrue);
      expect(Role.emergencyResponder.responds, isTrue);
      expect(Role.elder.responds, isFalse);
      expect(Role.administrator.responds, isFalse);
    });
  });

  group('TimelineEntry', () {
    Map<String, dynamic> entry(Map<String, dynamic>? detail) => <String, dynamic>{
      'id': 'audit-1',
      'action': 'ACKNOWLEDGED',
      'secondsFromTrigger': 40,
      'actor': <String, dynamic>{'id': 'f1', 'name': 'Aisha Otieno', 'role': 'FAMILY_MEMBER'},
      'detail': detail,
    };

    test('knows an answer that came by text', () {
      expect(TimelineEntry.fromJson(entry(<String, dynamic>{'via': 'sms'})).byText, isTrue);
    });

    test('treats anything else as the app, including entries from before replies existed', () {
      expect(TimelineEntry.fromJson(entry(<String, dynamic>{'via': 'app'})).byText, isFalse);
      expect(TimelineEntry.fromJson(entry(<String, dynamic>{'tier': 1})).byText, isFalse);
      expect(TimelineEntry.fromJson(entry(null)).byText, isFalse);
    });
  });

  group('Voice', () {
    test('reads who started a call', () {
      final Voice voice = Voice.fromJson(<String, dynamic>{
        'available': true,
        'startedBy': 'Mary',
        'startedAt': '2026-10-21T10:00:00.000Z',
      });
      expect(voice.hasStarted, isTrue);
      expect(voice.startedBy, 'Mary');
    });

    test('is off when the server sends nothing, as an older one would', () {
      expect(Voice.fromJson(null).available, isFalse);
      expect(Voice.fromJson(null).hasStarted, isFalse);
    });

    test('has not started while nobody has joined', () {
      expect(Voice.fromJson(<String, dynamic>{'available': true}).hasStarted, isFalse);
    });
  });
}
