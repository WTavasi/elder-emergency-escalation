import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/location/way_there.dart';
import 'package:mzazicare/core/map/emergency_map.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';
import 'package:mzazicare/features/responder/alert_detail_screen.dart';
import 'package:mzazicare/features/responder/widgets/call_button.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

Widget _wrap(
  AlertDetailController controller,
  AlertSummary fallback, {
  CanOpen? canOpen,
  Open? open,
}) => ChangeNotifierProvider<AlertDetailController>.value(
  value: controller,
  child: MaterialApp(
    theme: MzaziTheme.light(AppAudience.standard),
    home: AlertDetailScreen(fallback: fallback, canOpen: canOpen, open: open),
  ),
);

/// A screen tall enough for the whole trail, which sits under the map.
void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 4800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

/// A station asked about the emergency, as the detail view lists it.
Map<String, dynamic> _station(String name, String service) => <String, dynamic>{
  'name': name,
  'service': service,
  'station': null,
  'askedAt': DateTime.now().toUtc().toIso8601String(),
  'etaSeconds': 360,
  'byRoad': false,
  'reason': 'nearest',
  'status': 'asked',
};

Map<String, dynamic> _owned({String? elderPhone = '+254700000010'}) {
  final Map<String, dynamic> body = detailBody(
    state: 'ACKNOWLEDGED',
    acknowledgedBy: <String, dynamic>{
      'id': 'caregiver-1',
      'name': 'Peter Mwangi',
      'role': 'CAREGIVER',
    },
  );
  (body['elder'] as Map<String, dynamic>)['phone'] = elderPhone;
  return body;
}

void main() {
  testWidgets('an unanswered emergency offers going and declining, and nothing else', (
    WidgetTester tester,
  ) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await tester.pumpAndSettle();

    expect(find.text("I'm on my way"), findsOneWidget);
    expect(find.text('I cannot come'), findsOneWidget);
    expect(find.text('Close emergency'), findsNothing);

    controller.dispose();
  });

  testWidgets('once somebody owns it the screen offers closing and calling a responder', (
    WidgetTester tester,
  ) async {
    final Map<String, dynamic> owned = detailBody(
      state: 'ACKNOWLEDGED',
      acknowledgedBy: <String, dynamic>{
        'id': 'caregiver-1',
        'name': 'Peter Mwangi',
        'role': 'CAREGIVER',
      },
    );
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(owned)],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(
      _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
    );
    await controller.refresh();
    await tester.pumpAndSettle();

    expect(find.text('Close emergency'), findsOneWidget);
    expect(find.text('Ask for an emergency responder'), findsOneWidget);
    expect(find.text("I'm on my way"), findsNothing);
    expect(find.text('Peter Mwangi is on the way.'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('an emergency responder is never offered to ask for an emergency responder', (
    WidgetTester tester,
  ) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(_owned())],
    );
    final AlertDetailController controller = AlertDetailController(
      api: t.api,
      eventId: 'event-1',
      myRole: Role.emergencyResponder,
    );

    await tester.pumpWidget(
      _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
    );
    await controller.refresh();
    await tester.pumpAndSettle();

    expect(find.text('Close emergency'), findsOneWidget);
    expect(find.text('Call Grace'), findsOneWidget);
    expect(find.text('Ask for an emergency responder'), findsNothing);
    expect(find.text("We've asked for an emergency responder."), findsNothing);

    controller.dispose();
  });

  testWidgets('once a responder has been asked, the screen says so and offers another service', (
    WidgetTester tester,
  ) async {
    final Map<String, dynamic> asked = _owned()
      ..['responderRequestedAt'] = DateTime.now().toUtc().toIso8601String()
      ..['stations'] = <Map<String, dynamic>>[_station('Kileleshwa Response Unit', 'GENERAL')];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(asked)],
    );
    final AlertDetailController controller = AlertDetailController(
      api: t.api,
      eventId: 'event-1',
      myRole: Role.caregiver,
    );

    await tester.pumpWidget(
      _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
    );
    await controller.refresh();
    await tester.pumpAndSettle();

    expect(find.text('Ask for an emergency responder'), findsNothing);
    expect(find.text('Ask for another service'), findsOneWidget);
    expect(find.text("We've asked for an emergency responder."), findsOneWidget);
    expect(find.text('Call Grace'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('a closed emergency offers nothing to do', (WidgetTester tester) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody(state: 'RESOLVED'))],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(
      _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'RESOLVED'))),
    );
    await tester.pumpAndSettle();

    expect(find.text('Emergency closed. Nothing more to do.'), findsOneWidget);
    expect(find.text("I'm on my way"), findsNothing);

    controller.dispose();
  });

  testWidgets('the severity reasoning is nowhere on this screen', (WidgetTester tester) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();

    // Not collapsed. Absent. How a number was produced is an operations concern, and this
    // screen belongs to somebody deciding whether to set off.
    expect(find.text('How this was scored'), findsNothing);
    expect(find.text('Care level'), findsNothing);
    expect(find.text('Away from home'), findsNothing);

    // The band stays, because it is what says who to attend to first.
    expect(find.text('High'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('an alert the elder raised by texting HELP says so in the trail', (
    WidgetTester tester,
  ) async {
    _tall(tester);
    final Map<String, dynamic> body = detailBody();
    final List<Map<String, dynamic>> timeline = (body['timeline'] as List<Map<String, dynamic>>)
        .toList();
    timeline[0] = <String, dynamic>{
      ...timeline[0],
      'detail': <String, dynamic>{'trigger': 'PANIC', 'via': 'sms'},
    };
    body['timeline'] = timeline;
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(body)],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();
    await _openTrail(tester);

    expect(find.text('Grace Wanjiru asked for help, by text'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('the trail is numbered on one line, the latest filled in', (
    WidgetTester tester,
  ) async {
    _tall(tester);
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();
    await _openTrail(tester);

    // Three steps worth showing in the fixture: asked, sent, moved on. Scoring is left out.
    final double one = tester.getCenter(find.text('1').first).dy;
    final double two = tester.getCenter(find.text('2').first).dy;
    final double three = tester.getCenter(find.text('3').first).dy;
    expect(one, lessThan(two));
    expect(two, lessThan(three));
    expect(find.text('1 second after the alert'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('lists the emergency services asked, nearest first, with an estimate', (
    WidgetTester tester,
  ) async {
    _tall(tester);
    final Map<String, dynamic> body = detailBody()
      ..['stations'] = <Map<String, dynamic>>[
        <String, dynamic>{
          'name': 'Kilimani Police Station',
          'service': 'POLICE',
          'station': 'Lenana Road, Kilimani, Nairobi',
          'askedAt': '2026-10-20T10:00:30.000Z',
          'etaSeconds': 360,
          'byRoad': true,
          'reason': 'nearest',
          'status': 'declined',
        },
        <String, dynamic>{
          'name': 'Kileleshwa Police Station',
          'service': 'POLICE',
          'station': 'Off Laikipia Road, Kileleshwa, Nairobi',
          'askedAt': '2026-10-20T10:01:00.000Z',
          'etaSeconds': 540,
          'byRoad': true,
          'reason': 'declined',
          'status': 'asked',
        },
      ];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(body)],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();

    expect(find.text('NOW'), findsOneWidget);
    expect(find.text('Kilimani Police Station'), findsOneWidget);
    expect(find.text("Can't come."), findsOneWidget);
    expect(
      find.text('Asked, no answer yet. About 9 minutes away by road, from the station.'),
      findsOneWidget,
    );
    controller.dispose();
  });

  testWidgets('the trail reads as sentences rather than enum names', (WidgetTester tester) async {
    _tall(tester);
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();
    await _openTrail(tester);

    expect(find.text('Grace Wanjiru asked for help'), findsOneWidget);
    expect(find.text('at the start'), findsOneWidget);

    // The escalation names the person it moved on to, taken from the chain.
    expect(find.text('No answer in time. Now asking Aisha Otieno'), findsOneWidget);
    expect(find.text('Sent to Peter Mwangi'), findsOneWidget);

    // The scoring entry is dropped rather than translated: it is the system talking to
    // itself and there is nothing a caregiver can do about it.
    expect(find.textContaining('Severity'), findsNothing);
    expect(find.text('2 minutes after the alert'), findsOneWidget);

    // And none of the enum names survive.
    expect(find.text('Moved on'), findsNothing);
    expect(find.text('Triggered'), findsNothing);
    expect(find.textContaining('+120s'), findsNothing);

    controller.dispose();
  });

  testWidgets('the trail says what was reported and which service was asked', (
    WidgetTester tester,
  ) async {
    _tall(tester);
    final Map<String, dynamic> body = detailBody();
    (body['timeline'] as List<dynamic>).addAll(<Map<String, dynamic>>[
      <String, dynamic>{
        'id': 'log-type',
        'action': 'TYPE_REPORTED',
        'actor': <String, dynamic>{'id': 'elder-1', 'name': 'Grace Wanjiru', 'role': 'ELDER'},
        'detail': <String, dynamic>{'type': 'FIRE', 'via': 'sms'},
        'occurredAt': '2026-10-20T10:00:30.000Z',
        'secondsFromTrigger': 30,
      },
      <String, dynamic>{
        'id': 'log-service',
        'action': 'SERVICE_DISPATCHED',
        'actor': null,
        'detail': <String, dynamic>{'service': 'FIRE', 'reason': 'type', 'recipients': 1},
        'occurredAt': '2026-10-20T10:00:31.000Z',
        'secondsFromTrigger': 31,
      },
      <String, dynamic>{
        'id': 'log-station',
        'action': 'STATION_ASKED',
        'actor': null,
        'detail': <String, dynamic>{
          'name': 'Central Fire Station',
          'seconds': 720,
          'byRoad': true,
          'reason': 'nearest',
        },
        'occurredAt': '2026-10-20T10:00:31.000Z',
        'secondsFromTrigger': 31,
      },
    ]);
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(body)],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();
    await _openTrail(tester);

    expect(find.text('Grace Wanjiru said: fire, by text'), findsOneWidget);
    expect(find.text('Fire service asked at once'), findsOneWidget);
    expect(find.text('Central Fire Station asked, about 12 minutes away by road'), findsOneWidget);
    controller.dispose();
  });

  testWidgets('declining asks first, because it sends the emergency onward', (
    WidgetTester tester,
  ) async {
    int posts = 0;
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.method == 'POST') posts += 1;
      return <http.Response>[json(request.method == 'POST' ? emergencyBody() : detailBody())];
    });
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I cannot come'));
    await tester.pumpAndSettle();
    expect(find.text('Cannot come?'), findsOneWidget);
    expect(posts, 0);

    await tester.tap(find.text('Go back'));
    await tester.pumpAndSettle();
    expect(posts, 0);

    controller.dispose();
  });

  testWidgets('closing asks how it ended, with the question set apart from the answers', (
    WidgetTester tester,
  ) async {
    final Map<String, dynamic> owned = detailBody(
      state: 'ACKNOWLEDGED',
      acknowledgedBy: <String, dynamic>{
        'id': 'caregiver-1',
        'name': 'Peter Mwangi',
        'role': 'CAREGIVER',
      },
    );
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(owned)],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(
      _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
    );
    await controller.refresh();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Close emergency'));
    await tester.pumpAndSettle();

    expect(find.text('How did it end?'), findsOneWidget);
    // Every outcome, each with the line that tells two similar ones apart.
    expect(find.text('Handled at home'), findsOneWidget);
    expect(find.text('No help was needed'), findsOneWidget);
    expect(find.text('Something else'), findsOneWidget);

    controller.dispose();
  });

  group('what is happening', () {
    Map<String, dynamic> reported(String type, {bool serviceAsked = false}) => _owned()
      ..['reportedType'] = type
      ..['serviceRequested'] = serviceAsked ? 'FIRE' : null
      ..['serviceRequestedAt'] = serviceAsked ? DateTime.now().toUtc().toIso8601String() : null
      ..['stations'] = serviceAsked
          ? <Map<String, dynamic>>[_station('Central Fire Station', 'FIRE')]
          : <Map<String, dynamic>>[];

    testWidgets('says what the elder reported, and names the service the button asks for', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(reported('FALL'))],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myRole: Role.caregiver,
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(find.text('Grace says: Fall'), findsOneWidget);
      expect(find.text('Ask for an ambulance'), findsOneWidget);
      controller.dispose();
    });

    testWidgets('says the service was asked at once, for an urgent type', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[
          json(reported('FIRE', serviceAsked: true)),
        ],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myRole: Role.familyMember,
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(find.text('Grace says: Fire'), findsOneWidget);
      expect(find.text("We've asked for the fire service."), findsOneWidget);
      expect(find.text('Ask for the fire service'), findsNothing);
      controller.dispose();
    });

    testWidgets('the family chooses which service to ask, the one needed first', (
      WidgetTester tester,
    ) async {
      Map<String, dynamic>? sent;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.url.path.endsWith('/request-responder')) {
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return <http.Response>[json(<String, dynamic>{}, 202)];
        }
        return <http.Response>[json(reported('UNSAFE'))];
      });
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myRole: Role.familyMember,
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Ask for the police'));
      await tester.pumpAndSettle();
      expect(find.text('Who should we ask?'), findsOneWidget);
      // Every service is offered; the one this emergency needs is first.
      for (final String name in <String>[
        'Police',
        'Ambulance',
        'Fire service',
        'Emergency responder',
      ]) {
        expect(find.text(name), findsOneWidget);
      }
      await tester.tap(find.text('Ambulance'));
      await tester.pumpAndSettle();

      expect(sent, <String, dynamic>{'service': 'AMBULANCE'});
      controller.dispose();
    });

    testWidgets('closing starts from what the elder said, and sends what it actually was', (
      WidgetTester tester,
    ) async {
      String? body;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.method == 'POST') body = request.body;
        return <http.Response>[json(reported('UNWELL'))];
      });
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myRole: Role.caregiver,
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Close emergency'));
      await tester.pumpAndSettle();
      expect(find.text('What was it?'), findsOneWidget);
      expect(tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Unwell')).selected, isTrue);

      // It turned out to be a fall.
      await tester.tap(find.widgetWithText(ChoiceChip, 'Fall'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Handled at home'));
      await tester.pumpAndSettle();

      expect(body, contains('"confirmedType":"FALL"'));
      expect(body, contains('"outcome":"HANDLED_AT_HOME"'));
      controller.dispose();
    });
  });

  testWidgets('choosing something else asks for words, and refuses to close without them', (
    WidgetTester tester,
  ) async {
    int posts = 0;
    String? body;
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.method == 'POST') {
        posts += 1;
        body = request.body;
      }
      return <http.Response>[
        json(
          request.method == 'POST'
              ? emergencyBody(state: 'RESOLVED')
              : detailBody(
                  state: 'ACKNOWLEDGED',
                  acknowledgedBy: <String, dynamic>{
                    'id': 'caregiver-1',
                    'name': 'Peter Mwangi',
                    'role': 'CAREGIVER',
                  },
                ),
        ),
      ];
    });
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(
      _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
    );
    await controller.refresh();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Close emergency'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Something else'));
    // pump rather than pumpAndSettle from here on. The field autofocuses and a focused
    // field blinks its cursor for as long as it lives, so there is no settled state to
    // wait for and pumpAndSettle would sit there until it timed out.
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('What happened?'), findsOneWidget);

    // Pressing through with an empty field must not close anything. An "other" with
    // nothing written against it is an emergency nobody can account for later.
    await tester.tap(find.widgetWithText(FilledButton, 'Save and close'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(posts, 0);
    expect(find.text('Add a few words about what happened.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'She locked herself out');
    await tester.tap(find.widgetWithText(FilledButton, 'Save and close'));
    await tester.pump(const Duration(milliseconds: 400));

    expect(posts, 1);
    expect(body, contains('OTHER'));
    expect(body, contains('She locked herself out'));

    controller.dispose();
  });

  group('calling the elder', () {
    testWidgets('sits beside calling a responder once somebody has taken it', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_owned())],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(find.text('Call Grace'), findsOneWidget);
      expect(find.text('Ask for an emergency responder'), findsOneWidget);

      // Side by side means the same row, so the same vertical position.
      final double callY = tester.getCenter(find.text('Call Grace')).dy;
      final double responderY = tester.getCenter(find.text('Ask for an emergency responder')).dy;
      expect((callY - responderY).abs(), lessThan(24));

      controller.dispose();
    });

    testWidgets('is told apart from calling a responder by its icon, not only its words', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_owned())],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      // Both labels begin with "Call" and they do different things. A phone for the one
      // that rings her, the emergency mark for the one that rings nobody and sends the
      // alert on through the system.
      expect(
        find.descendant(of: find.byType(CallButton), matching: find.byIcon(Icons.phone)),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.emergency), findsOneWidget);

      controller.dispose();
    });

    testWidgets('is offered before anybody has answered too', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(detailBody())],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
      await tester.pumpAndSettle();

      // Ringing her before deciding whether to set off is the most natural first move.
      expect(find.text("I'm on my way"), findsOneWidget);
      expect(find.text('Call Grace'), findsOneWidget);

      controller.dispose();
    });

    testWidgets('dials her number through the phone\'s own dialler', (WidgetTester tester) async {
      final List<Uri> dialled = <Uri>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_owned())],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(
          controller,
          AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED')),
          canOpen: (Uri _) async => true,
          open: (Uri uri) async {
            dialled.add(uri);
            return true;
          },
        ),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Call Grace'));
      await tester.pumpAndSettle();

      expect(dialled.single.toString(), 'tel:+254700000010');
      // A call did not change anything about the emergency, so nothing was sent.
      expect(t.calls.where((Exchange e) => e.method == 'POST'), isEmpty);

      controller.dispose();
    });

    testWidgets('shows the number to dial by hand when the device cannot call', (
      WidgetTester tester,
    ) async {
      bool opened = false;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_owned())],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(
          controller,
          AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED')),
          // A simulator, or a tablet with no SIM.
          canOpen: (Uri _) async => false,
          open: (Uri _) async {
            opened = true;
            return true;
          },
        ),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      await tester.tap(find.text('Call Grace'));
      await tester.pumpAndSettle();

      // Not a button that silently does nothing. The number, selectable, to dial by hand.
      expect(opened, isFalse);
      expect(
        find.text('This device cannot make calls. Call this number from a phone:'),
        findsOneWidget,
      );
      // Matched on the widget itself: SelectableText renders through an editable field
      // rather than a plain Text, and whether find.text sees that is not worth guessing.
      expect(
        find.byWidgetPredicate((Widget w) => w is SelectableText && w.data == '+254700000010'),
        findsOneWidget,
      );

      controller.dispose();
    });

    testWidgets('does not appear when there is no number to call', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_owned(elderPhone: null))],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(
          controller,
          AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED', elderPhone: null)),
        ),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(find.textContaining('Call Grace'), findsNothing);
      // The responder button still has the row to itself.
      expect(find.text('Ask for an emergency responder'), findsOneWidget);

      controller.dispose();
    });

    testWidgets('clears the touch target floor', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_owned())],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(
        tester.getSize(find.byType(CallButton)).height,
        greaterThanOrEqualTo(MzaziA11y.standardMinTouchTarget),
      );

      controller.dispose();
    });
  });

  testWidgets('every action control clears the touch target floor', (WidgetTester tester) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await tester.pumpAndSettle();

    // Any kind of button, found through its label. Matching on an exact type would break
    // silently the moment a button gains an icon: FilledButton.icon builds a private
    // subclass, and byType compares runtime types exactly, so the finder would find
    // nothing and the floor would go unchecked.
    Finder button(String label) => find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate((Widget w) => w is ButtonStyleButton),
    );

    final Map<String, Finder> controls = <String, Finder>{
      "I'm on my way": button("I'm on my way"),
      'I cannot come': button('I cannot come'),
      'Call Grace': button('Call Grace'),
    };

    for (final MapEntry<String, Finder> control in controls.entries) {
      expect(
        tester.getSize(control.value).height,
        greaterThanOrEqualTo(MzaziA11y.standardMinTouchTarget),
        reason: '${control.key} must be reachable by an unsteady hand',
      );
    }

    controller.dispose();
  });

  group('on the way', () {
    Map<String, dynamic> owned({String? arrivedAt, Map<String, dynamic>? journey}) =>
        <String, dynamic>{
          ...detailBody(
            state: arrivedAt == null ? 'ACKNOWLEDGED' : 'ON_SCENE',
            acknowledgedBy: <String, dynamic>{
              'id': 'caregiver-1',
              'name': 'Peter Mwangi',
              'role': 'CAREGIVER',
            },
          ),
          'arrivedAt': arrivedAt,
          'journey': journey,
        };

    testWidgets('the person on their way swipes to say they have arrived', (
      WidgetTester tester,
    ) async {
      bool arrived = false;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.url.path.endsWith('/arrived')) {
          arrived = true;
          return <http.Response>[json(<String, dynamic>{})];
        }
        return <http.Response>[
          json(owned(arrivedAt: arrived ? DateTime.now().toUtc().toIso8601String() : null)),
        ];
      });
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myId: 'caregiver-1',
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await tester.pumpAndSettle();

      expect(find.text("Swipe when you're with Grace"), findsOneWidget);
      // Closing is still possible on the way, a step back from arriving.
      expect(find.text('Close emergency'), findsOneWidget);

      await tester.drag(find.byIcon(Icons.arrow_forward), const Offset(2000, 0));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 1));

      expect(t.calls.map((Exchange e) => e.path), contains('/api/v1/alerts/event-1/arrived'));
      expect(find.text('Peter Mwangi arrived just now.'), findsOneWidget);
      expect(find.text('Help is there'), findsOneWidget);
      expect(find.text("Swipe when you're with Grace"), findsNothing);

      controller.dispose();
    });

    testWidgets('the rest of the circle sees how long, and where on a map', (
      WidgetTester tester,
    ) async {
      final Map<String, dynamic> body = owned(
        journey: <String, dynamic>{
          'etaSeconds': 540,
          'distanceMetres': 4200,
          'source': 'osrm',
          'updatedAt': DateTime.now().toUtc().toIso8601String(),
          'latitude': -1.27,
          'longitude': 36.82,
        },
      );
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(body)],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myId: 'family-1',
      );
      final List<Uri> opened = <Uri>[];

      await tester.pumpWidget(
        _wrap(
          controller,
          AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED')),
          open: (Uri uri) async {
            opened.add(uri);
            return true;
          },
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Peter is about 9 minutes away'), findsOneWidget);
      expect(find.text('4.2 km by road, updated just now.'), findsOneWidget);
      // Not theirs, so nothing to swipe.
      expect(find.text("Swipe when you're with Grace"), findsNothing);

      // Peter is on the map beside Grace, and the map opens full screen.
      final Finder map = find.byType(EmergencyMap);
      await tester.scrollUntilVisible(map, 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(map);
      await tester.pumpAndSettle();
      expect(
        tester.widget<EmergencyMap>(map).travellers.map((MapTraveller who) => who.label),
        <String>['Peter'],
      );
      await tester.tap(map);
      await tester.pumpAndSettle();
      // Full screen: the back arrow alone in the bar, and everyone back in view on the map.
      expect(find.byType(MapCanvas), findsOneWidget);
      expect(find.byTooltip('Show everyone'), findsOneWidget);
      // Directions are still handed to a maps app, from under the map.
      await tester.tap(find.text('Get directions'));
      await tester.pumpAndSettle();
      expect(opened.single.host, 'www.google.com');
      controller.dispose();
    });

    /// A caregiver who took Grace's alert on, sharing their way there, on the screen.
    Future<({AlertDetailController controller, WayThere way})> sharing(WidgetTester tester) async {
      final FakePositionSource source = FakePositionSource();
      addTearDown(source.close);
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.url.path.endsWith('/preferences')) {
          return <http.Response>[
            json(<String, dynamic>{'shareWayThere': true}),
          ];
        }
        return <http.Response>[json(owned())];
      });
      final WayThere way = WayThere(api: t.api, source: source, every: const Duration(hours: 1));
      await way.follow('caregiver-1');
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myId: 'caregiver-1',
        wayThere: way,
      );

      // Tall enough that nothing on the page needs scrolling to be tapped.
      await tester.binding.setSurfaceSize(const Size(800, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await tester.pumpAndSettle();
      return (controller: controller, way: way);
    }

    /// The screen taken down first, so nothing is still listening when both are disposed.
    Future<void> finish(
      WidgetTester tester,
      ({AlertDetailController controller, WayThere way}) t,
    ) async {
      await tester.pumpWidget(const SizedBox.shrink());
      t.controller.dispose();
      t.way.dispose();
    }

    // The page's button, found by its own mark; the dialog's, found inside the dialog.
    // Both say "Stop sharing", so finding either by its words alone depends on order.
    final Finder stopOnPage = find.byIcon(Icons.location_off_outlined);
    final Finder stopInDialog = find.descendant(
      of: find.byType(BottomSheet),
      matching: find.text('Stop sharing'),
    );

    testWidgets('shows that the way there is being shared', (WidgetTester tester) async {
      final ({AlertDetailController controller, WayThere way}) t = await sharing(tester);

      expect(t.way.isSharingFor('event-1'), isTrue);
      expect(find.text('Sharing your location'), findsOneWidget);
      expect(stopOnPage, findsOneWidget);
      await finish(tester, t);
    });

    testWidgets('stopping asks first, and keeping it changes nothing', (WidgetTester tester) async {
      final ({AlertDetailController controller, WayThere way}) t = await sharing(tester);

      await tester.tap(stopOnPage);
      await tester.pumpAndSettle();
      expect(find.text('Stop sharing location?'), findsOneWidget);

      await tester.tap(find.text('Keep sharing'));
      await tester.pumpAndSettle();

      expect(find.byType(BottomSheet), findsNothing);
      expect(t.way.isSharingFor('event-1'), isTrue);
      await finish(tester, t);
    });

    testWidgets('stopping, once confirmed, stops and offers to share again', (
      WidgetTester tester,
    ) async {
      final ({AlertDetailController controller, WayThere way}) t = await sharing(tester);

      await tester.tap(stopOnPage);
      await tester.pumpAndSettle();
      await tester.tap(stopInDialog);
      await tester.pumpAndSettle();

      expect(t.way.isSharingFor('event-1'), isFalse);
      expect(find.text('Share live location'), findsOneWidget);
      await finish(tester, t);
    });

    testWidgets('nothing about the way there once they have arrived', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[
          json(owned(arrivedAt: DateTime.now().toUtc().toIso8601String())),
        ],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myId: 'family-1',
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ON_SCENE'))),
      );
      await tester.pumpAndSettle();

      expect(find.text('On the way'.toUpperCase()), findsNothing);
      expect(find.text('On the way'), findsNothing);
      expect(find.text('Peter Mwangi arrived just now.'), findsOneWidget);
      controller.dispose();
    });
  });

  group('talking through the app', () {
    Map<String, dynamic> withVoice({required bool available, String? startedBy}) =>
        <String, dynamic>{
          ...detailBody(
            state: 'ACKNOWLEDGED',
            acknowledgedBy: <String, dynamic>{
              'id': 'caregiver-1',
              'name': 'Peter Mwangi',
              'role': 'CAREGIVER',
            },
          ),
          'voice': <String, dynamic>{
            'available': available,
            'startedBy': startedBy,
            'startedAt': startedBy == null ? null : '2026-10-21T10:00:00.000Z',
          },
        };

    testWidgets('is not offered when the server has no voice service, and says so plainly', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(withVoice(available: false))],
      );
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );

      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(find.text('Talk to Grace'), findsNothing);
      // Said plainly, with no setup details.
      expect(find.text("Calls through the app aren't available right now."), findsOneWidget);
      expect(find.textContaining('LiveKit'), findsNothing);
      controller.dispose();
    });

    testWidgets('opens a call that waits for the elder, and hanging up comes back', (
      WidgetTester tester,
    ) async {
      final FakeVoiceRoom room = FakeVoiceRoom();
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.url.path.endsWith('/voice')) {
          return <http.Response>[json(voiceAccessBody())];
        }
        return <http.Response>[json(withVoice(available: true, startedBy: 'Peter'))];
      });
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        voiceRoom: () => room,
      );

      await tester.binding.setSurfaceSize(const Size(800, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        _wrap(controller, AlertSummary.fromJson(summaryBody(state: 'ACKNOWLEDGED'))),
      );
      await tester.pumpAndSettle();
      expect(find.text('Peter started a call.'), findsOneWidget);

      await tester.tap(find.text('Talk to Grace'));
      // Not pumpAndSettle: the call screen redraws its timer every second while the
      // call is open, so it never settles. Enough for the page to slide in and join.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('Waiting for Grace to join'), findsOneWidget);
      expect(room.microphone, isTrue);
      // A responder holds the phone to the ear to start with.
      expect(room.speaker, isFalse);

      room.present(<String>['Grace']);
      await tester.pump();
      expect(find.text('On a call with Grace'), findsOneWidget);

      await tester.tap(find.byTooltip('End'));
      await tester.pumpAndSettle();

      expect(room.left, isTrue);
      expect(find.text('Talk to Grace'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
    });
  });
}

/// The trail is on its own page now: opens it from the alert.
Future<void> _openTrail(WidgetTester tester) async {
  final Finder row = find.text('What happened');
  await tester.ensureVisible(row);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pumpAndSettle();
}
