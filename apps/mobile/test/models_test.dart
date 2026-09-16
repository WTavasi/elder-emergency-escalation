import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/api/models.dart';

void main() {
  group('EventState', () {
    test('knows which states are still live', () {
      expect(EventState.triggered.isOpen, isTrue);
      expect(EventState.escalated.isOpen, isTrue);
      expect(EventState.acknowledged.isOpen, isTrue);
      expect(EventState.resolved.isOpen, isFalse);
      expect(EventState.cancelled.isOpen, isFalse);
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
        'id': 'e', 'name': 'Grace', 'phone': '+254700000010', 'email': null, 'role': 'ELDER',
        'home': <String, dynamic>{'latitude': -1.1, 'longitude': 36.8, 'addressLabel': 'Home'},
      });
      final Account carer = Account.fromJson(<String, dynamic>{
        'id': 'c', 'name': 'Mary', 'phone': '+254700000020', 'email': null,
        'role': 'CAREGIVER', 'home': null,
      });

      expect(elder.home?.latitude, -1.1);
      expect(carer.home, isNull);
    });

    test('survives a half location rather than sending a meaningless coordinate', () {
      final Account elder = Account.fromJson(<String, dynamic>{
        'id': 'e', 'name': 'Grace', 'phone': '+254700000010', 'email': null, 'role': 'ELDER',
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
}
