import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/api/models.dart';
import 'package:mzazicare/responder/alert_detail_controller.dart';
import 'package:mzazicare/responder/alert_detail_screen.dart';
import 'package:mzazicare/theme/theme.dart';
import 'package:mzazicare/widgets/call_button.dart';
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

    expect(find.text('I am on my way'), findsOneWidget);
    expect(find.text('I cannot come'), findsOneWidget);
    expect(find.text('Close this emergency'), findsNothing);

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

    expect(find.text('Close this emergency'), findsOneWidget);
    expect(find.text('Call an emergency responder'), findsOneWidget);
    expect(find.text('I am on my way'), findsNothing);
    expect(find.text('Peter Mwangi is responding.'), findsOneWidget);

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

    expect(find.text('This emergency is closed. Nothing more to do.'), findsOneWidget);
    expect(find.text('I am on my way'), findsNothing);

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
    expect(find.text('Elevated severity'), findsOneWidget);

    controller.dispose();
  });

  testWidgets('the trail reads as sentences rather than enum names', (WidgetTester tester) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();

    expect(find.text('Grace Wanjiru asked for help'), findsOneWidget);
    expect(find.text('when the alert was raised'), findsOneWidget);

    // The escalation names the person it moved on to, taken from the chain.
    expect(find.text('Nobody answered in time, so it moved on to Aisha Otieno'), findsOneWidget);
    expect(find.text('Sent to Peter Mwangi'), findsOneWidget);

    // The scoring entry is dropped rather than translated: it is the system talking to
    // itself and there is nothing a caregiver can do about it.
    expect(find.textContaining('Severity'), findsNothing);
    expect(find.text('2 minutes after the alert'), findsOneWidget);

    // And none of the enum names survive.
    expect(find.text('Escalated'), findsNothing);
    expect(find.text('Triggered'), findsNothing);
    expect(find.textContaining('+120s'), findsNothing);

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

    await tester.tap(find.text('Never mind'));
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

    await tester.tap(find.text('Close this emergency'));
    await tester.pumpAndSettle();

    expect(find.text('How did it end?'), findsOneWidget);
    // Every outcome, each with the line that tells two similar ones apart.
    expect(find.text('Handled at home'), findsOneWidget);
    expect(find.text('No help was needed'), findsOneWidget);
    expect(find.text('Something else'), findsOneWidget);

    controller.dispose();
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

    await tester.tap(find.text('Close this emergency'));
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
    expect(find.text('Say briefly what happened.'), findsOneWidget);

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
      expect(find.text('Call an emergency responder'), findsOneWidget);

      // Side by side means the same row, so the same vertical position.
      final double callY = tester.getCenter(find.text('Call Grace')).dy;
      final double responderY = tester.getCenter(find.text('Call an emergency responder')).dy;
      expect((callY - responderY).abs(), lessThan(24));

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
      expect(find.text('I am on my way'), findsOneWidget);
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
      expect(find.text('This device cannot place calls. Dial this number from a phone:'), findsOneWidget);
      // Matched on the widget itself: SelectableText renders through an editable field
      // rather than a plain Text, and whether find.text sees that is not worth guessing.
      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SelectableText && w.data == '+254700000010',
        ),
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
      expect(find.text('Call an emergency responder'), findsOneWidget);

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

    final Map<String, Finder> controls = <String, Finder>{
      'I am on my way': find.widgetWithText(FilledButton, 'I am on my way'),
      'I cannot come': find.widgetWithText(OutlinedButton, 'I cannot come'),
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
}
