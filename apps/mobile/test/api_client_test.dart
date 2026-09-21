import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/api/models.dart';

import 'support.dart';

void main() {
  group('signing in', () {
    test('keeps the session and sends the access token on later requests', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          index == 0 ? json(sessionBody()) : json(emergencyBody()),
        ],
      );

      await t.api.signIn(phone: '+254700000010', password: 'Dev!2026');
      await t.api.raiseAlert(testHome);

      expect(t.calls[1].authorization, 'Bearer access-1');
    });

    test('does not retry a refused sign-in, which would spend a rate limit attempt', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          json(<String, String>{'message': 'Phone number or password is incorrect'}, 401),
        ],
      );

      await expectLater(
        t.api.signIn(phone: '+254700000010', password: 'wrong'),
        throwsA(isA<ApiException>()),
      );
      expect(t.calls, hasLength(1));
    });

    test('passes the API message through rather than rewording it', () async {
      // The server words a wrong password and an unknown number identically so the API
      // cannot be used to discover who is registered. Rewording here would undo that.
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          json(<String, String>{'message': 'Phone number or password is incorrect'}, 401),
        ],
      );

      await expectLater(
        t.api.signIn(phone: '+254700000010', password: 'wrong'),
        throwsA(
          isA<ApiException>().having(
            (ApiException e) => e.message,
            'message',
            'Phone number or password is incorrect',
          ),
        ),
      );
    });
  });

  group('expired access token', () {
    test('refreshes once and replays the original request', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          switch (index) {
            0 => json(sessionBody()),
            1 => json(<String, String>{'message': 'expired'}, 401),
            2 => json(sessionBody(access: 'access-2', refresh: 'refresh-2')),
            _ => json(emergencyBody()),
          },
        ],
      );

      await t.api.signIn(phone: '+254700000010', password: 'Dev!2026');
      final Emergency raised = await t.api.raiseAlert(testHome);

      expect(raised.id, 'event-1');
      expect(t.calls, hasLength(4));
      expect(t.calls[3].authorization, 'Bearer access-2');
    });

    test('gives up rather than looping when the refresh is itself refused', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          index == 0 ? json(sessionBody()) : json(<String, String>{'message': 'no'}, 401),
        ],
      );

      await t.api.signIn(phone: '+254700000010', password: 'Dev!2026');

      await expectLater(t.api.raiseAlert(testHome), throwsA(isA<ApiException>()));
      // Sign-in, the refused request, the refused refresh. Nothing more.
      expect(t.calls, hasLength(3));
      expect(t.api.session, isNull);
    });

    test('reports the session ending, so the app can return to sign-in', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          index == 0 ? json(sessionBody()) : json(<String, String>{'message': 'no'}, 401),
        ],
      );

      final List<Session?> changes = <Session?>[];
      t.api.onSessionChanged = changes.add;

      await t.api.signIn(phone: '+254700000010', password: 'Dev!2026');
      await expectLater(t.api.raiseAlert(testHome), throwsA(isA<ApiException>()));

      expect(changes.last, isNull);
    });
  });

  group('raising an alert', () {
    test('sends the location exactly once, in the request that raises it', () async {
      late http.Request captured;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int index) {
        if (index == 1) captured = request;
        return <http.Response>[index == 0 ? json(sessionBody()) : json(emergencyBody())];
      });

      await t.api.signIn(phone: '+254700000010', password: 'Dev!2026');
      await t.api.raiseAlert(testHome);

      expect(captured.body, contains('-1.286389'));
      expect(captured.body, contains('Kilimani, Nairobi'));
    });
  });

  group('signing out', () {
    test('clears the local session even when the request fails', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int index) => <http.Response>[
          index == 0 ? json(sessionBody()) : json(<String, String>{'message': 'offline'}, 500),
        ],
      );

      await t.api.signIn(phone: '+254700000010', password: 'Dev!2026');
      await t.api.signOut();

      // Somebody tapping sign out on a phone with no signal still expects to be
      // signed out of the phone in front of them.
      expect(t.api.session, isNull);
    });
  });
}
