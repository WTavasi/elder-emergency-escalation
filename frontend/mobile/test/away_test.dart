import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/away/away.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/profile/profile_screen.dart';
import 'package:mzazicare/features/responder/alert_list_screen.dart';
import 'package:mzazicare/features/responder/alerts_controller.dart';
import 'package:provider/provider.dart';

import 'support.dart';

/// The server's side of being away: what it holds, and what it was asked.
class _Server {
  bool away = false;
  String? until;
  List<String> nobodyElse = const <String>[];
  final List<String> asked = <String>[];
  final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];

  Map<String, dynamic> get status => <String, dynamic>{
    'away': away,
    'since': away ? '2026-11-25T08:00:00.000Z' : null,
    'until': away ? until : null,
  };

  List<http.Response> answer(http.Request request, int _) {
    final String path = request.url.path;
    if (path.endsWith('/auth/me/away')) {
      asked.add(request.method);
      if (request.method == 'PUT') {
        final Map<String, dynamic> body = jsonDecode(request.body) as Map<String, dynamic>;
        bodies.add(body);
        away = true;
        until = body['until'] as String?;
        return <http.Response>[
          json(<String, dynamic>{...status, 'nobodyElseFor': nobodyElse}),
        ];
      }
      if (request.method == 'DELETE') away = false;
      return <http.Response>[json(status)];
    }
    if (path.endsWith('/alerts')) return <http.Response>[json(<Object>[])];
    if (path.endsWith('/auth/me/profile')) {
      return <http.Response>[
        json(<String, dynamic>{
          'memberSince': '2026-09-01T08:00:00.000Z',
          'circles': <Object>[],
          'record': <String, dynamic>{'answered': 0},
          'carers': <Object>[],
        }),
      ];
    }
    return <http.Response>[json(<String, dynamic>{})];
  }
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  group('the words for being away', () {
    final DateTime now = DateTime(2026, 11, 25, 9, 30);

    test('says until when, today, tomorrow or another day', () {
      expect(awayUntilLabel(DateTime(2026, 11, 25, 18), now: now), 'Until 18:00');
      expect(awayUntilLabel(DateTime(2026, 11, 26, 8), now: now), 'Until tomorrow, 8:00');
      expect(awayUntilLabel(DateTime(2026, 12, 5, 8, 15), now: now), 'Until 5 Dec, 8:15');
      expect(awayUntilLabel(null, now: now), 'Until you turn it off');
    });

    test('says just "Away" about somebody else who gave no end', () {
      expect(awayLabel(DateTime(2026, 11, 25, 18), now: now), 'Away until 18:00');
      expect(awayLabel(null, now: now), 'Away');
    });

    test('ends a night away at eight the next morning', () {
      expect(AwayFor.tomorrowMorning.until(now), DateTime(2026, 11, 26, 8));
      expect(AwayFor.hour.until(now), DateTime(2026, 11, 25, 10, 30));
      expect(AwayFor.untilOff.until(now), isNull);
    });
  });

  group('AwayController', () {
    testWidgets('goes away until a time, and is back by itself when it comes', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server();
      final DateTime start = DateTime(2026, 11, 25, 9);
      final AwayController away = AwayController(
        api: buildApi(server.answer).api,
        clock: () => start,
      );

      await away.goAway(AwayFor.hour);
      expect(away.away, isTrue);
      expect(server.bodies.single['until'], isNotNull);

      await tester.pump(const Duration(minutes: 59));
      expect(away.away, isTrue);
      await tester.pump(const Duration(minutes: 2));
      expect(away.away, isFalse);
      away.dispose();
    });

    test('comes back when asked', () async {
      final _Server server = _Server()..away = true;
      final AwayController away = AwayController(api: buildApi(server.answer).api);
      await away.load();
      expect(away.away, isTrue);

      await away.comeBack();
      expect(away.away, isFalse);
      expect(server.asked, <String>['GET', 'DELETE']);
      away.dispose();
    });
  });

  Future<(_Server, AwayController)> pumpMe(WidgetTester tester, {_Server? server}) async {
    final _Server s = server ?? _Server();
    final ApiClient api = buildApi((http.Request r, int i) {
      if (r.url.path.endsWith('/auth/login')) {
        final Map<String, dynamic> body = sessionBody();
        (body['user'] as Map<String, dynamic>)
          ..['role'] = 'CAREGIVER'
          ..['name'] = 'Mary Otieno';
        return <http.Response>[json(body)];
      }
      return s.answer(r, i);
    }).api;
    final AuthController auth = AuthController(api: api, store: SessionStore());
    await auth.signIn(phone: '+254700000020', password: 'Dev!2026');
    final AwayController away = AwayController(api: api);
    await away.load();

    await tester.pumpWidget(
      MultiProvider(
        providers: <ChangeNotifierProvider<ChangeNotifier>>[
          ChangeNotifierProvider<AuthController>.value(value: auth),
          ChangeNotifierProvider<AwayController>.value(value: away),
          ChangeNotifierProvider<AlertsController>(
            create: (_) => AlertsController(api: api, pollInterval: const Duration(hours: 1)),
          ),
        ],
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: const ProfileScreen(),
          routes: <String, WidgetBuilder>{'/alerts': (_) => AlertListScreen(api: api)},
        ),
      ),
    );
    await tester.pumpAndSettle();
    return (s, away);
  }

  testWidgets('a caregiver goes away for a while from their own page, and says how long', (
    WidgetTester tester,
  ) async {
    final (_Server server, AwayController away) = await pumpMe(tester);

    expect(find.text('AVAILABILITY'), findsOneWidget);
    await tester.tap(find.text('Away'));
    await tester.pumpAndSettle();

    expect(find.text('How long will you be away?'), findsOneWidget);
    await tester.tap(find.text('For 4 hours'));
    await tester.pumpAndSettle();

    expect(server.asked.last, 'PUT');
    expect(server.bodies.single['until'], isNotNull);
    expect(away.away, isTrue);
    expect(find.textContaining('Until '), findsOneWidget);

    // The timer that brings them back in four hours goes with the page.
    await tester.pumpWidget(const SizedBox());
    away.dispose();
  });

  testWidgets('going back from the sheet leaves them as they were', (WidgetTester tester) async {
    final (_Server server, AwayController away) = await pumpMe(tester);

    await tester.tap(find.text('Away'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Go back'));
    await tester.pumpAndSettle();

    expect(server.asked, <String>['GET']);
    expect(away.away, isFalse);
  });

  testWidgets('says when nobody else is left for an elder', (WidgetTester tester) async {
    final _Server server = _Server()..nobodyElse = <String>['Grace Wanjiru'];
    await pumpMe(tester, server: server);

    await tester.tap(find.text('Away'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Until I turn it off'));
    await tester.pumpAndSettle();

    expect(find.text('Until you turn it off'), findsOneWidget);
    expect(
      find.text('Nobody else is available for Grace, so alerts go straight to emergency services.'),
      findsOneWidget,
    );
  });

  testWidgets('turning the switch off is being back', (WidgetTester tester) async {
    final (_Server server, AwayController away) = await pumpMe(
      tester,
      server: _Server()..away = true,
    );

    await tester.tap(find.text('Away'));
    await tester.pumpAndSettle();

    expect(server.asked.last, 'DELETE');
    expect(away.away, isFalse);
  });

  testWidgets('the alerts say they are away, and take them back in one tap', (
    WidgetTester tester,
  ) async {
    final (_Server server, AwayController away) = await pumpMe(
      tester,
      server: _Server()
        ..away = true
        ..until = null,
    );
    final NavigatorState navigator = tester.state<NavigatorState>(find.byType(Navigator));
    navigator.pushNamed('/alerts');
    await tester.pumpAndSettle();

    expect(find.text('Away until you turn it off'), findsOneWidget);
    expect(find.text('Alerts still reach you. Others are asked first.'), findsOneWidget);

    await tester.tap(find.text("I'm back"));
    await tester.pumpAndSettle();
    expect(server.asked.last, 'DELETE');
    expect(away.away, isFalse);
    expect(find.text("I'm back"), findsNothing);
  });
}
