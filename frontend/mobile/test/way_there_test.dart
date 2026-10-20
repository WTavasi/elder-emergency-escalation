import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/location/position_source.dart';
import 'package:mzazicare/core/location/way_there.dart';

import 'support.dart';

/// Long enough for a scripted request and its answer to go round.
Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 20));

const Fix _twoKmAway = Fix(latitude: -1.27, longitude: 36.82, accuracyMetres: 12);

Map<String, dynamic> _journey({int eta = 540}) => <String, dynamic>{
  'etaSeconds': eta,
  'distanceMetres': 4200,
  'source': 'osrm',
  'updatedAt': '2026-10-20T10:00:00.000Z',
  'latitude': -1.27,
  'longitude': 36.82,
};

void main() {
  late FakePositionSource source;

  setUp(() => source = FakePositionSource());
  tearDown(() => source.close());

  /// A server that answers preferences and positions. [position] decides each answer
  /// to a position report.
  ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) build({
    bool shareWayThere = true,
    http.Response Function(int report)? position,
  }) {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    int reports = 0;
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.body.isNotEmpty) {
        bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      }
      if (request.url.path.endsWith('/preferences')) {
        final bool value = request.method == 'PATCH'
            ? (jsonDecode(request.body) as Map<String, dynamic>)['shareWayThere'] as bool
            : shareWayThere;
        return <http.Response>[
          json(<String, dynamic>{'shareWayThere': value}),
        ];
      }
      if (request.url.path.endsWith('/position')) {
        reports += 1;
        return <http.Response>[
          position?.call(reports) ??
              json(<String, dynamic>{'arrived': false, 'journey': _journey()}),
        ];
      }
      return <http.Response>[json(<String, dynamic>{}, 404)];
    });
    // An hour between ticks, so only the first reading is sent unless a test asks.
    final WayThere way = WayThere(api: t.api, source: source, every: const Duration(hours: 1));
    return (way: way, calls: t.calls, bodies: bodies);
  }

  group('the preference', () {
    test('is read for the person who signs in, and off until it is', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build();

      expect(t.way.enabled, isFalse);
      expect(t.way.isLoaded, isFalse);
      await t.way.follow('caregiver-1');

      expect(t.way.isLoaded, isTrue);
      expect(t.way.enabled, isTrue);
      expect(t.calls.single.path, '/api/v1/auth/me/preferences');
      t.way.dispose();
    });

    test('asks for location before it is turned on, and saves it once allowed', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build(
        shareWayThere: false,
      );
      await t.way.follow('caregiver-1');

      final String? problem = await t.way.setEnabled(true);

      expect(problem, isNull);
      expect(source.asked, <bool>[true]);
      expect(t.way.enabled, isTrue);
      expect(t.calls.last.method, 'PATCH');
      expect(t.bodies.last, <String, dynamic>{'shareWayThere': true});
      t.way.dispose();
    });

    test('stays off, unsaved, when location is refused', () async {
      source.answer = LocationAccess.deniedForever;
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build(
        shareWayThere: false,
      );
      await t.way.follow('caregiver-1');

      final String? problem = await t.way.setEnabled(true);

      expect(problem, contains('phone settings'));
      expect(t.way.enabled, isFalse);
      expect(t.way.access, LocationAccess.deniedForever);
      // Only the read. A switch that says "on" for a phone that cannot share is the
      // thing this order prevents.
      expect(t.calls.where((Exchange e) => e.method == 'PATCH'), isEmpty);
      t.way.dispose();
    });
  });

  group('sharing', () {
    test('sends the first reading at once and keeps the time that comes back', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build();
      await t.way.follow('caregiver-1');

      await t.way.shareFor('event-1');
      expect(t.way.isSharingFor('event-1'), isTrue);
      // Never asks at this moment: the question belongs to turning the setting on.
      expect(source.asked, <bool>[false]);

      source.readings.add(_twoKmAway);
      await _settle();

      expect(t.calls.last.path, '/api/v1/alerts/event-1/position');
      expect(t.bodies.last, <String, dynamic>{
        'latitude': -1.27,
        'longitude': 36.82,
        'accuracyMetres': 12.0,
      });
      expect(t.way.journey?.etaSeconds, 540);
      expect(t.way.journey?.byRoad, isTrue);
      t.way.dispose();
    });

    test('does nothing while the preference is off', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build(
        shareWayThere: false,
      );
      await t.way.follow('caregiver-1');

      await t.way.shareFor('event-1');

      expect(t.way.state, SharingState.idle);
      expect(source.readings.hasListener, isFalse);
      t.way.dispose();
    });

    test('stops by itself once the server says they have arrived', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build(
        position: (int _) => json(<String, dynamic>{'arrived': true, 'journey': null}),
      );
      await t.way.follow('caregiver-1');
      await t.way.shareFor('event-1');

      source.readings.add(_twoKmAway);
      await _settle();

      expect(t.way.state, SharingState.arrived);
      expect(t.way.journey, isNull);
      expect(source.readings.hasListener, isFalse);
      t.way.dispose();
    });

    test('stops and says why when the server will not take it', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build(
        position: (int _) =>
            json(<String, dynamic>{'message': 'This emergency is already closed'}, 409),
      );
      await t.way.follow('caregiver-1');
      await t.way.shareFor('event-1');

      source.readings.add(_twoKmAway);
      await _settle();

      expect(t.way.state, SharingState.stopped);
      expect(t.way.problem, 'This emergency is already closed');
      expect(source.readings.hasListener, isFalse);
      t.way.dispose();
    });

    test('carries on through a refusal for sending too often', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build(
        position: (int _) => json(<String, dynamic>{'message': 'Too many requests'}, 429),
      );
      await t.way.follow('caregiver-1');
      await t.way.shareFor('event-1');

      source.readings.add(_twoKmAway);
      await _settle();

      expect(t.way.isSharingFor('event-1'), isTrue);
      t.way.dispose();
    });

    test('does not start without location access, and says so', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build();
      await t.way.follow('caregiver-1');
      source.answer = LocationAccess.serviceOff;

      await t.way.shareFor('event-1');

      expect(t.way.state, SharingState.stopped);
      expect(t.way.eventId, 'event-1');
      expect(t.way.problem, contains('switched off'));
      expect(source.readings.hasListener, isFalse);
      t.way.dispose();
    });

    test('stops the moment the person signs out', () async {
      final ({WayThere way, List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = build();
      await t.way.follow('caregiver-1');
      await t.way.shareFor('event-1');
      expect(source.readings.hasListener, isTrue);

      await t.way.follow(null);

      expect(source.readings.hasListener, isFalse);
      expect(t.way.state, SharingState.idle);
      expect(t.way.enabled, isFalse);
      t.way.dispose();
    });
  });

  group('words', () {
    test('say the time and distance the way a person would', () {
      expect(timeAway(30), 'less than a minute');
      expect(timeAway(90), 'about 2 minutes');
      expect(timeAway(60), 'about 1 minute');
      expect(timeAway(540), 'about 9 minutes');
      expect(timeAway(3600), 'about 1 hour');
      expect(timeAway(4500), 'about 1 hour 15 minutes');
      expect(timeAway(7260), 'about 2 hours 1 minute');
      expect(distanceWords(648), '650 m');
      expect(distanceWords(4210), '4.2 km');
    });
  });
}
