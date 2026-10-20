import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elder/widgets/help_progress.dart';

import 'support.dart';

/// The elder's screen once help has been asked for: told, coming, here.
void main() {
  Future<void> show(WidgetTester tester, Emergency? emergency) => tester.pumpWidget(
    MaterialApp(
      theme: MzaziTheme.light(AppAudience.elder),
      home: Scaffold(body: HelpProgress(emergency: emergency)),
    ),
  );

  Emergency emergency({bool owned = false, bool arrived = false, int? eta}) =>
      Emergency.fromJson(<String, dynamic>{
        ...emergencyBody(
          state: arrived ? 'ON_SCENE' : (owned ? 'ACKNOWLEDGED' : 'NOTIFIED'),
          acknowledgedBy: owned || arrived
              ? <String, dynamic>{'id': 'c1', 'name': 'Mary Otieno', 'role': 'CAREGIVER'}
              : null,
        ),
        'arrivedAt': arrived ? '2026-10-20T10:05:00.000Z' : null,
        'journey': eta == null
            ? null
            : <String, dynamic>{
                'etaSeconds': eta,
                'distanceMetres': 4200,
                'source': 'estimate',
                'updatedAt': '2026-10-20T10:00:00.000Z',
                // The elder's copy never carries these. Null, as the server sends it.
                'latitude': null,
                'longitude': null,
              },
      });

  testWidgets('before anybody answers, the people who look after her have been told', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await show(tester, emergency());

    expect(find.text('Help is on the way'), findsOneWidget);
    expect(find.bySemanticsLabel('Step 1 of 3, Told'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('once somebody is coming, it says who and how long, never where', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await show(tester, emergency(owned: true, eta: 540));

    expect(find.text('Mary Otieno is coming'), findsOneWidget);
    expect(find.text('About 9 minutes away.'), findsOneWidget);
    expect(find.bySemanticsLabel('Step 2 of 3, Coming'), findsOneWidget);
    expect(find.textContaining('km'), findsNothing);
    semantics.dispose();
  });

  testWidgets('without a shared way there, coming has no time and that is fine', (
    WidgetTester tester,
  ) async {
    await show(tester, emergency(owned: true));

    expect(find.text('Mary Otieno is coming'), findsOneWidget);
    expect(find.textContaining('away.'), findsNothing);
  });

  testWidgets('once they arrive, it says so', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await show(tester, emergency(arrived: true));

    expect(find.text('Mary Otieno is with you'), findsOneWidget);
    expect(find.bySemanticsLabel('Step 3 of 3, Here'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('the bar fits a small phone at the elder size without breaking a word', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await show(tester, emergency(owned: true, eta: 540));

    // Every label on one line: no taller than a single line of its own style.
    for (final String step in <String>['Told', 'Coming', 'Here']) {
      final Text label = tester.widget<Text>(find.text(step));
      expect(label.maxLines, 1, reason: '$step may wrap');
    }
    // Every dot on the same line, the current larger one included. They used to sit at
    // different heights, which broke the line between them.
    final Iterable<double> centres = tester
        .widgetList<AnimatedContainer>(
          find.byWidgetPredicate(
            (Widget w) =>
                w is AnimatedContainer &&
                w.decoration is BoxDecoration &&
                (w.decoration! as BoxDecoration).shape == BoxShape.circle,
          ),
        )
        .map((AnimatedContainer dot) => tester.getCenter(find.byWidget(dot)).dy);
    expect(centres, hasLength(3));
    expect(centres.toSet(), hasLength(1));
    expect(tester.takeException(), isNull);
  });
}
