import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/api/models.dart';
import 'package:mzazicare/responder/alert_detail_controller.dart';
import 'package:mzazicare/responder/alert_detail_screen.dart';
import 'package:mzazicare/theme/theme.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

Widget _wrap(AlertDetailController controller, AlertSummary fallback) =>
    ChangeNotifierProvider<AlertDetailController>.value(
      value: controller,
      child: MaterialApp(
        theme: MzaziTheme.light(AppAudience.standard),
        home: AlertDetailScreen(fallback: fallback),
      ),
    );

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

  testWidgets('the severity reasoning starts closed', (WidgetTester tester) async {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(detailBody())],
    );
    final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

    await tester.pumpWidget(_wrap(controller, AlertSummary.fromJson(summaryBody())));
    await controller.refresh();
    await tester.pumpAndSettle();

    // The heading is there, so it is reachable; the factor is not, so it is not in the
    // way of the decision.
    expect(find.text('How this was scored'), findsOneWidget);
    expect(find.text('Care level'), findsNothing);

    await tester.tap(find.text('How this was scored'));
    await tester.pumpAndSettle();
    expect(find.text('Care level'), findsOneWidget);

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
