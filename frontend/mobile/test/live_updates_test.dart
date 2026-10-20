import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/live/live_updates.dart';
import 'package:mzazicare/core/live/realtime_connection.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';
import 'package:mzazicare/features/responder/alerts_controller.dart';

import 'support.dart';

/// Long enough for a burst to settle, short enough not to slow the suite.
Future<void> settled() => Future<void>.delayed(const Duration(milliseconds: 400));

void main() {
  group('change notices', () {
    test('read a socket snapshot', () {
      final LiveChange? change = LiveChange.tryParse(<String, dynamic>{
        'eventId': 'event-1',
        'elderlyId': 'elder-1',
        'state': 'ACKNOWLEDGED',
        'currentTier': 1,
      });

      expect(change?.eventId, 'event-1');
      expect(change?.elderlyId, 'elder-1');
      expect(change?.state, 'ACKNOWLEDGED');
    });

    test('read a push data payload, which names no elder', () {
      final LiveChange? change = LiveChange.tryParse(<String, dynamic>{
        'eventId': 'event-1',
        'state': 'ESCALATED',
        'tier': '2',
        'action': 'respond',
      });

      expect(change?.eventId, 'event-1');
      expect(change?.elderlyId, isNull);
    });

    test('ignore anything without an emergency to point at', () {
      expect(LiveChange.tryParse(null), isNull);
      expect(LiveChange.tryParse('event-1'), isNull);
      expect(LiveChange.tryParse(<String, dynamic>{'eventId': ''}), isNull);
      expect(LiveChange.tryParse(<String, dynamic>{'eventId': 42}), isNull);
    });
  });

  group('the realtime address', () {
    test('drops the API path and adds the namespace', () {
      expect(realtimeUrlFor('http://10.0.2.2:3000/api/v1'), 'http://10.0.2.2:3000/realtime');
    });

    test('keeps https through a tunnel', () {
      expect(
        realtimeUrlFor('https://quiet-owl.ngrok-free.app/api/v1'),
        'https://quiet-owl.ngrok-free.app/realtime',
      );
    });
  });

  group('following changes', () {
    test('folds a burst into one refresh', () async {
      final LiveUpdates live = LiveUpdates();
      int refreshes = 0;
      final LiveFollower follower = LiveFollower(
        live: live,
        wants: (LiveChange _) => true,
        refresh: () async {
          refreshes += 1;
        },
      )..start();

      for (int i = 0; i < 3; i += 1) {
        live.publish(const LiveChange(eventId: 'event-1'));
      }
      await settled();

      expect(refreshes, 1);
      follower.dispose();
      live.dispose();
    });

    test('ignores changes it did not ask about', () async {
      final LiveUpdates live = LiveUpdates();
      int refreshes = 0;
      final LiveFollower follower = LiveFollower(
        live: live,
        wants: (LiveChange change) => change.eventId == 'event-1',
        refresh: () async {
          refreshes += 1;
        },
      )..start();

      live.publish(const LiveChange(eventId: 'event-2'));
      await settled();

      expect(refreshes, 0);
      follower.dispose();
      live.dispose();
    });

    test('polls at full pace without a socket, and rests while one is up', () {
      final LiveUpdates live = LiveUpdates();
      final LiveFollower follower = LiveFollower(
        live: live,
        wants: (LiveChange _) => true,
        refresh: () async {},
      );

      follower.asked();
      expect(follower.shouldPoll, isTrue, reason: 'no socket, so the poll is all there is');

      live.connectionChanged(true);
      expect(follower.shouldPoll, isFalse, reason: 'just asked, and the socket is up');

      final LiveFollower overdue = LiveFollower(
        live: live,
        wants: (LiveChange _) => true,
        refresh: () async {},
        fallback: Duration.zero,
      )..asked();
      expect(overdue.shouldPoll, isTrue, reason: 'the heartbeat still runs');

      follower.dispose();
      overdue.dispose();
      live.dispose();
    });
  });

  group('screens', () {
    test('the alert list re-reads when one of its emergencies changes', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[
          json(<Map<String, dynamic>>[summaryBody()]),
        ],
      );
      final LiveUpdates live = LiveUpdates()..connectionChanged(true);
      final AlertsController controller = AlertsController(
        api: t.api,
        pollInterval: const Duration(hours: 1),
        live: live,
      )..start();
      await settled();
      expect(t.calls, hasLength(1));

      live.publish(const LiveChange(eventId: 'event-1', state: 'ACKNOWLEDGED'));
      await settled();

      expect(t.calls, hasLength(2));
      controller.dispose();
      live.dispose();
    });

    test('a detail screen re-reads only for its own emergency', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(detailBody())],
      );
      final LiveUpdates live = LiveUpdates()..connectionChanged(true);
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        pollInterval: const Duration(hours: 1),
        live: live,
      )..start();
      await settled();
      expect(t.calls, hasLength(1));

      live.publish(const LiveChange(eventId: 'someone-else'));
      await settled();
      expect(t.calls, hasLength(1));

      live.publish(const LiveChange(eventId: 'event-1'));
      await settled();
      expect(t.calls, hasLength(2));

      controller.dispose();
      live.dispose();
    });

    test('a screen built without the hub keeps working as it did', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(<Map<String, dynamic>>[])],
      );
      final AlertsController controller = AlertsController(
        api: t.api,
        pollInterval: const Duration(hours: 1),
      )..start();
      await settled();

      expect(t.calls, hasLength(1));
      controller.dispose();
    });
  });
}
