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
    expect(find.bySemanticsLabel('Step 1 of 4, Told'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('once somebody is coming, it says who and how long, never where', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await show(tester, emergency(owned: true, eta: 540));

    expect(find.text('Mary Otieno is coming'), findsOneWidget);
    expect(find.text('About 9 minutes away.'), findsOneWidget);
    expect(find.bySemanticsLabel('Step 2 of 4, Coming'), findsOneWidget);
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
    expect(find.bySemanticsLabel('Step 3 of 4, Here'), findsOneWidget);
    semantics.dispose();
  });
}
