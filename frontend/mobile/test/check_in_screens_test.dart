import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/check_ins/check_in_settings.dart';
import 'package:mzazicare/features/elder/alert_controller.dart';
import 'package:mzazicare/features/elder/elder_home_screen.dart';
import 'package:mzazicare/features/elder/widgets/panic_button.dart';
import 'package:mzazicare/features/home/home_shell.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';
import 'package:mzazicare/features/responder/alert_detail_screen.dart';
import 'package:mzazicare/features/responder/alerts_controller.dart';
import 'package:provider/provider.dart';

import 'support.dart';

/// Everything the check-in screens ask of the server, with what it has said so far.
class _Server {
  _Server({
    this.overview = const <String, dynamic>{
      'schedule': null,
      'recent': <dynamic>[],
      'canEdit': true,
    },
    this.mine = const <String, dynamic>{},
    this.outcome = 'answered',
    this.alertOpen = false,
  }) {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(_answer);
    api = t.api;
    calls = t.calls;
  }

  Map<String, dynamic> overview;
  Map<String, dynamic> mine;
  final String outcome;

  /// An alert raised by a missed check-in, open until the elder answers.
  bool alertOpen;
  late final ApiClient api;
  late final List<Exchange> calls;
  final List<Map<String, dynamic>> sent = <Map<String, dynamic>>[];

  List<http.Response> _answer(http.Request request, int _) {
    final String path = request.url.path;
    if (request.body.isNotEmpty) sent.add(jsonDecode(request.body) as Map<String, dynamic>);

    if (path.endsWith('/auth/login')) return <http.Response>[json(sessionBody())];
    if (path.endsWith('/consent')) {
      return <http.Response>[json(<String, dynamic>{'needsConfirmation': false})];
    }
    if (path.endsWith('/check-ins/mine')) return <http.Response>[json(mine)];
    if (path.endsWith('/check-ins/answer')) {
      mine = const <String, dynamic>{};
      if (outcome == 'withdrawn') alertOpen = false;
      return <http.Response>[json(<String, dynamic>{'outcome': outcome})];
    }
    if (path.endsWith('/check-ins/confirm')) {
      mine = const <String, dynamic>{};
      return <http.Response>[json(mine)];
    }
    if (request.method == 'PUT' && path.endsWith('/check-ins')) {
      final Map<String, dynamic> body = sent.last;
      overview = <String, dynamic>{
        'schedule': checkInScheduleBody(
          enabled: body['enabled'] as bool,
          times: (body['times'] as List<dynamic>).cast<String>(),
          waitingForElder: true,
        ),
        'recent': <dynamic>[],
        'canEdit': true,
      };
      return <http.Response>[json(overview)];
    }
    if (path.endsWith('/check-ins')) return <http.Response>[json(overview)];
    if (path.endsWith('/alerts')) {
      return <http.Response>[
        json(<dynamic>[
          if (alertOpen) <String, dynamic>{...summaryBody(), 'trigger': 'MISSED_CHECK_IN'},
        ]),
      ];
    }
    if (path.endsWith('/alerts/event-1')) {
      return <http.Response>[
        json(<String, dynamic>{
          ...summaryBody(state: alertOpen ? 'NOTIFIED' : 'CANCELLED'),
          'trigger': 'MISSED_CHECK_IN',
        }),
      ];
    }
    return <http.Response>[json(<String, dynamic>{})];
  }

  int asked(String method, String ending) =>
      calls.where((Exchange c) => c.method == method && c.path.endsWith(ending)).length;
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  group('the daily check-in section', () {
    Future<void> show(WidgetTester tester, _Server server, {bool forElder = false}) async {
      await tester.binding.setSurfaceSize(const Size(800, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: Scaffold(
            body: ListView(
              children: <Widget>[
                CheckInSettings(
                  api: server.api,
                  elderId: 'elder-1',
                  elderName: 'Grace Wanjiru',
                  forElder: forElder,
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('a caregiver sets it up, and it waits for the elder to agree', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server();
      await show(tester, server);

      expect(find.textContaining('Off. MzaziCare can ask Grace'), findsOneWidget);

      await tester.tap(find.text('Set up'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Grace will be asked to agree'), findsOneWidget);

      await tester.tap(find.text('Ask every day'));
      await tester.pumpAndSettle();
      expect(find.text('09:00'), findsOneWidget);

      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(server.asked('PUT', '/elders/elder-1/check-ins'), 1);
      expect(server.sent.last, <String, dynamic>{
        'enabled': true,
        'times': <String>['09:00'],
        'graceMinutes': 30,
      });
      expect(find.textContaining('once Grace agrees on their phone'), findsOneWidget);
      expect(find.text('Change times'), findsOneWidget);
    });

    testWidgets('a time can be taken out, and an empty list cannot be saved', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server();
      await show(tester, server);

      await tester.tap(find.text('Set up'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ask every day'));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Remove 09:00'));
      await tester.pumpAndSettle();

      final FilledButton save = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'));
      expect(save.onPressed, isNull);
    });

    testWidgets('a family member without the right to change it sees the last answers', (
      WidgetTester tester,
    ) async {
      final DateTime now = DateTime.now();
      final DateTime nine = DateTime(now.year, now.month, now.day, 9);
      final _Server server = _Server(
        overview: <String, dynamic>{
          'schedule': checkInScheduleBody(),
          'recent': <Map<String, dynamic>>[
            checkInBody(
              status: 'ANSWERED',
              answeredVia: 'app',
              dueAt: nine.toUtc().toIso8601String(),
            ),
          ],
          'canEdit': false,
        },
      );
      await show(tester, server);

      expect(find.textContaining('Every day at 09:00. If Grace does not answer'), findsOneWidget);
      expect(find.text('Today 09:00: answered in the app'), findsOneWidget);
      expect(find.text('Change times'), findsNothing);
      expect(find.text('Set up'), findsNothing);
    });

    testWidgets('the elder can always change their own, and is spoken to as "you"', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(
        overview: <String, dynamic>{
          'schedule': checkInScheduleBody(times: <String>['09:00', '18:00']),
          'recent': <dynamic>[],
          'canEdit': false,
        },
      );
      await show(tester, server, forElder: true);

      expect(
        find.textContaining('Every day at 09:00 and 18:00. If you do not answer'),
        findsOneWidget,
      );
      expect(find.text('Change times'), findsOneWidget);
    });
  });

  group('the elder home screen', () {
    Future<void> show(WidgetTester tester, _Server server) async {
      final AuthController auth = AuthController(api: server.api, store: SessionStore());
      await auth.signIn(phone: '+254700000010', password: 'Dev!2026');

      await tester.binding.setSurfaceSize(const Size(800, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ChangeNotifierProvider<AuthController>.value(
          value: auth,
          child: ChangeNotifierProvider<AlertController>(
            create: (_) => AlertController(api: server.api),
            child: MaterialApp(
              theme: MzaziTheme.light(AppAudience.elder),
              home: ElderHomeScreen(api: server.api, checkInPoll: null),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('asks whether they are all right, above the help button, and thanks them', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(
        mine: <String, dynamic>{'checkIn': checkInBody()},
      );
      await show(tester, server);

      expect(find.text('Are you all right?'), findsOneWidget);
      // Above the help button, never in its place.
      expect(find.byType(PanicButton), findsOneWidget);

      await tester.tap(find.text('I am all right'));
      await tester.pumpAndSettle();

      expect(server.asked('POST', '/check-ins/answer'), 1);
      expect(find.text('Are you all right?'), findsNothing);
      expect(find.text('Thank you. Your family can see you are all right.'), findsOneWidget);
    });

    testWidgets('asks the elder to agree to a check-in somebody else set up', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(
        mine: <String, dynamic>{
          'checkIn': null,
          'waitingForAgreement': checkInScheduleBody(waitingForElder: true),
        },
      );
      await show(tester, server);

      expect(
        find.textContaining('Mary would like MzaziCare to check on you every day at 09:00'),
        findsOneWidget,
      );

      await tester.tap(find.text('Yes, check on me'));
      await tester.pumpAndSettle();

      expect(server.asked('POST', '/elders/elder-1/check-ins/confirm'), 1);
      expect(server.sent.last, <String, dynamic>{'agree': true});
      expect(find.text('Yes, check on me'), findsNothing);
    });

    testWidgets('after a missed check-in, says the family was told, and a late answer withdraws it', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(
        mine: <String, dynamic>{'checkIn': checkInBody(status: 'MISSED', eventId: 'event-1')},
        outcome: 'withdrawn',
        alertOpen: true,
      );
      await show(tester, server);

      expect(
        find.text('You did not answer the check-in, so your family has been told.'),
        findsOneWidget,
      );

      await tester.tap(find.text('I am all right'));
      await tester.pumpAndSettle();

      expect(server.asked('POST', '/check-ins/answer'), 1);
      expect(find.text('Thank you'), findsOneWidget);
      expect(find.textContaining('Your family has been told you are all right'), findsOneWidget);
    });
  });

  group('for the people who respond', () {
    testWidgets('the alert list marks an alert nobody pressed for', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        final String path = request.url.path;
        if (path.endsWith('/auth/login')) return <http.Response>[json(sessionBody())];
        if (path.endsWith('/alerts')) {
          return <http.Response>[
            json(<Map<String, dynamic>>[
              <String, dynamic>{...summaryBody(), 'trigger': 'MISSED_CHECK_IN'},
            ]),
          ];
        }
        return <http.Response>[json(<Map<String, dynamic>>[])];
      });
      final AuthController auth = AuthController(api: t.api, store: SessionStore());
      await auth.signIn(phone: '+254700000020', password: 'Dev!2026');

      await tester.pumpWidget(
        MultiProvider(
          providers: <ChangeNotifierProvider<ChangeNotifier>>[
            ChangeNotifierProvider<AuthController>.value(value: auth),
            ChangeNotifierProvider<AlertsController>(
              create: (_) => AlertsController(api: t.api, pollInterval: const Duration(hours: 1)),
            ),
          ],
          child: MaterialApp(
            theme: MzaziTheme.light(AppAudience.standard),
            home: HomeShell(api: t.api, role: Role.caregiver),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Grace Wanjiru'), findsOneWidget);
      expect(find.text('Missed check-in'), findsOneWidget);
    });

    testWidgets('the alert page says to call first, and its trail says what happened', (
      WidgetTester tester,
    ) async {
      final Map<String, dynamic> body = detailBody(state: 'CANCELLED');
      body['trigger'] = 'MISSED_CHECK_IN';
      final List<Map<String, dynamic>> timeline = body['timeline'] as List<Map<String, dynamic>>;
      timeline[0] = <String, dynamic>{
        ...timeline[0],
        'actor': null,
        'detail': <String, dynamic>{'trigger': 'MISSED_CHECK_IN'},
      };
      const Map<String, dynamic> grace = <String, dynamic>{
        'id': 'elder-1',
        'name': 'Grace Wanjiru',
        'role': 'ELDER',
      };
      timeline.addAll(<Map<String, dynamic>>[
        <String, dynamic>{
          'id': 'audit-5',
          'action': 'CHECKED_IN_LATE',
          'previousState': null,
          'newState': null,
          'actor': grace,
          'detail': null,
          'occurredAt': '2026-09-16T10:10:00.000Z',
          'secondsFromTrigger': 600,
        },
        <String, dynamic>{
          'id': 'audit-6',
          'action': 'CANCELLED',
          'previousState': 'ESCALATED',
          'newState': 'CANCELLED',
          'actor': grace,
          'detail': <String, dynamic>{'reason': 'checked-in-late'},
          'occurredAt': '2026-09-16T10:10:00.000Z',
          'secondsFromTrigger': 600,
        },
      ]);
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(body)],
      );
      final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

      await tester.binding.setSurfaceSize(const Size(800, 2400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ChangeNotifierProvider<AlertDetailController>.value(
          value: controller,
          child: MaterialApp(
            theme: MzaziTheme.light(AppAudience.standard),
            home: AlertDetailScreen(fallback: AlertSummary.fromJson(summaryBody())),
          ),
        ),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(
        find.text('Grace did not answer a daily check-in. Nobody pressed for help, so call first.'),
        findsOneWidget,
      );
      expect(find.text('The daily check-in went unanswered'), findsOneWidget);
      expect(find.text('Grace Wanjiru answered the check-in late'), findsOneWidget);
      expect(find.text('Withdrawn: Grace Wanjiru answered the check-in'), findsOneWidget);
      expect(find.text('Grace Wanjiru asked for help'), findsNothing);

      controller.dispose();
    });
  });
}
