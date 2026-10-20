import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/api/models.dart';

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
}
