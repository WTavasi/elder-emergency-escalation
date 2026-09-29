import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/elder/alert_controller.dart';

import 'support.dart';

/// The elder's side of an emergency.
///
/// Two properties matter more than anything else here and are tested first: raising
/// must never be blocked by something optional, and one press must never become two
/// emergencies.
void main() {
  AlertController build(ApiClient api, {Duration window = const Duration(seconds: 1)}) =>
      AlertController(
        api: api,
        cancelWindow: window,
        pollInterval: const Duration(milliseconds: 100),
      );

  group('raising', () {
    test('sends one emergency however many times the control is pressed', () async {
      int raises = 0;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int index) {
        if (request.url.path.endsWith('/alerts')) raises += 1;
        return <http.Response>[json(emergencyBody())];
      });

      final AlertController alerts = build(t.api);

      // Three presses in the same instant, which is exactly what a frightened person
      // does. The controller refuses the second and third, because the first has
      // already moved it out of the state that accepts a press.
      await Future.wait<void>(<Future<void>>[alerts.raise(), alerts.raise(), alerts.raise()]);

      expect(raises, 1);
      alerts.dispose();
    });

    test('moves to the cancellable window once the server has it', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[json(emergencyBody())],
      );

      final AlertController alerts = build(t.api);
      await alerts.raise();

      expect(alerts.phase, AlertPhase.cancellable);
      expect(alerts.secondsLeft, 1);
      alerts.dispose();
    });

    test('stays on the panic control and explains itself when the server refuses', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          json(<String, String>{'message': 'Too many requests.'}, 429),
        ],
      );

      final AlertController alerts = build(t.api);
      await alerts.raise();

      expect(alerts.phase, AlertPhase.idle);
      expect(alerts.error, 'Too many requests.');
      // The control must come back. A failed attempt to call for help is the worst
      // possible moment to leave somebody with nothing to press.
      expect(alerts.canRaise, isTrue);
      alerts.dispose();
    });
  });

  group('the location', () {
    test('is not sent, because the server decides where the emergency is', () async {
      String? sent;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int index) {
        if (request.method == 'POST') sent = request.body;
        return <http.Response>[json(emergencyBody())];
      });

      final AlertController alerts = AlertController(api: t.api);
      await alerts.raise();

      expect(sent, '{}');
      alerts.dispose();
    });

    test('never blocks the press, whatever the account is missing', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[json(emergencyBody())],
      );

      // There is deliberately no precondition left to fail. An account with no
      // registered home still raises, because refusing to call for help over an
      // incomplete profile is the wrong failure.
      final AlertController alerts = AlertController(api: t.api);
      await alerts.raise();

      expect(t.calls, isNotEmpty);
      expect(alerts.error, isNull);
      alerts.dispose();
    });
  });

  group('the cancellation window', () {
    test('closes on its own and moves to help being on the way', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[json(emergencyBody())],
      );

      final AlertController alerts = build(t.api);
      await alerts.raise();
      await Future<void>.delayed(const Duration(milliseconds: 1300));

      expect(alerts.phase, AlertPhase.live);
      alerts.dispose();
    });

    test('withdraws the emergency while it is still open', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          json(emergencyBody(state: index == 0 ? 'NOTIFIED' : 'CANCELLED')),
        ],
      );

      final AlertController alerts = build(t.api, window: const Duration(seconds: 10));
      await alerts.raise();
      await alerts.cancel();

      expect(alerts.phase, AlertPhase.cancelled);
      alerts.dispose();
    });

    test('keeps the emergency standing when the window closed mid-request', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          index == 0
              ? json(emergencyBody())
              : json(<String, String>{'message': 'The cancellation window has passed'}, 409),
        ],
      );

      final AlertController alerts = build(t.api, window: const Duration(seconds: 10));
      await alerts.raise();
      await alerts.cancel();

      // Saying the emergency stands is more honest than offering the button again.
      expect(alerts.phase, AlertPhase.live);
      expect(alerts.error, contains('window'));
      alerts.dispose();
    });
  });

  group('once help is coming', () {
    test('picks up who took responsibility', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          json(
            emergencyBody(
              state: index == 0 ? 'NOTIFIED' : 'ACKNOWLEDGED',
              acknowledgedBy: index == 0
                  ? null
                  : <String, dynamic>{'id': 'c1', 'name': 'Mary Otieno', 'role': 'CAREGIVER'},
            ),
          ),
        ],
      );

      final AlertController alerts = build(t.api);
      await alerts.raise();
      await Future<void>.delayed(const Duration(milliseconds: 1400));

      expect(alerts.emergency?.acknowledgedByName, 'Mary Otieno');
      alerts.dispose();
    });

    test('leaves the screen alone when a poll fails', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          index == 0 ? json(emergencyBody()) : json(<String, String>{'message': 'offline'}, 500),
        ],
      );

      final AlertController alerts = build(t.api);
      await alerts.raise();
      await Future<void>.delayed(const Duration(milliseconds: 1400));

      // An error banner over "help is on the way" would frighten somebody for a reason
      // they cannot act on. The emergency is with the server, not with this phone.
      expect(alerts.phase, AlertPhase.live);
      expect(alerts.error, isNull);
      alerts.dispose();
    });
  });
}
