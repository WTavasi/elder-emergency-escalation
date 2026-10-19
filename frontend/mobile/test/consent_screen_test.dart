import 'dart:async';
import 'dart:convert' show jsonDecode;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/consent/consent_screen.dart';

import 'support.dart';

Map<String, dynamic> item(
  String type, {
  bool active = true,
  String? confirmedAt,
  String? withdrawnAt,
}) => <String, dynamic>{
  'type': type,
  'active': active,
  'givenBy': <String, dynamic>{'name': 'Mary Otieno', 'relationship': 'daughter'},
  'givenAt': '2026-10-01T09:00:00.000Z',
  'confirmedAt': confirmedAt,
  'withdrawnAt': withdrawnAt,
};

Map<String, dynamic> consentBody({
  bool needsConfirmation = true,
  bool canWithdraw = true,
  bool locationActive = true,
}) => <String, dynamic>{
  'elderId': 'elder-1',
  'elderName': 'Grace Wanjiru',
  'policyVersion': '2026-09-1',
  'needsConfirmation': needsConfirmation,
  'canWithdraw': canWithdraw,
  'items': <Map<String, dynamic>>[
    item('DATA_PROCESSING'),
    item(
      'LOCATION_SHARING',
      active: locationActive,
      withdrawnAt: locationActive ? null : '2026-10-18T09:00:00.000Z',
    ),
    item('CONTACT_SHARING'),
  ],
};

void main() {
  test('reads a consent view, and leaves out a kind it does not know', () {
    final Map<String, dynamic> body = consentBody();
    (body['items'] as List<Map<String, dynamic>>).add(item('SOMETHING_NEW'));

    final ConsentView view = ConsentView.fromJson(body);

    expect(view.items, hasLength(3));
    expect(view.needsConfirmation, isTrue);
    expect(view.givenOnBehalf?.givenByName, 'Mary Otieno');
    expect(view.items[0].kind, ConsentKind.dataProcessing);
  });

  Future<({List<Exchange> calls, List<Map<String, dynamic>> bodies})> pump(
    WidgetTester tester, {
    required ConsentAudience audience,
    bool firstSignIn = false,
    bool canWithdraw = true,
    VoidCallback? onServiceEnded,
  }) async {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.method == 'POST') {
        bodies.add(
          request.body.isEmpty
              ? <String, dynamic>{}
              : jsonDecode(request.body) as Map<String, dynamic>,
        );
      }
      if (request.url.path.endsWith('/withdraw')) {
        return <http.Response>[json(consentBody(needsConfirmation: false, locationActive: false))];
      }
      if (request.url.path.endsWith('/confirm')) {
        return <http.Response>[json(consentBody(needsConfirmation: false))];
      }
      return <http.Response>[json(consentBody(canWithdraw: canWithdraw))];
    });

    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    // Opened on top of another page, as the app opens it, so closing it has somewhere
    // to go back to.
    final GlobalKey<NavigatorState> navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigator,
        theme: MzaziTheme.light(AppAudience.standard),
        home: const Scaffold(body: Text('Underneath')),
      ),
    );
    unawaited(
      navigator.currentState!.push(
        MaterialPageRoute<bool>(
          builder: (_) => ConsentScreen(
            api: t.api,
            elderId: 'elder-1',
            audience: audience,
            firstSignIn: firstSignIn,
            onServiceEnded: onServiceEnded,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return (calls: t.calls, bodies: bodies);
  }

  testWidgets('at first sign-in, says who agreed for her and records her own agreement', (
    WidgetTester tester,
  ) async {
    final ({List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = await pump(
      tester,
      audience: ConsentAudience.elder,
      firstSignIn: true,
    );

    expect(find.text('Before you start'), findsOneWidget);
    expect(find.textContaining('Mary Otieno (daughter) agreed to these for you'), findsOneWidget);
    expect(find.text('Not now'), findsOneWidget);

    await tester.tap(find.text('I agree'));
    await tester.pumpAndSettle();

    expect(
      t.calls.any(
        (Exchange c) => c.method == 'POST' && c.path == '/api/v1/elders/elder-1/consent/confirm',
      ),
      isTrue,
    );
    // Closed again, back to where it was opened from.
    expect(find.text('Underneath'), findsOneWidget);
  });

  testWidgets('withdrawing asks first, then sends only that consent', (WidgetTester tester) async {
    final ({List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = await pump(
      tester,
      audience: ConsentAudience.careCircle,
    );

    // Section labels are set in capitals; the words a screen reader hears are unchanged.
    expect(find.text('SHARING WHERE THEY ARE'), findsOneWidget);
    expect(find.text('Agreed by Mary Otieno on 1 October 2026'), findsNWidgets(3));

    await tester.tap(find.text('Withdraw').first);
    await tester.pumpAndSettle();
    expect(find.text('Keep it'), findsOneWidget);

    await tester.tap(find.text('Keep it'));
    await tester.pumpAndSettle();
    expect(t.bodies, isEmpty);

    // Processing has "Stop MzaziCare", so the first "Withdraw" is location sharing.
    await tester.tap(find.text('Withdraw').first);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Withdraw'));
    await tester.pumpAndSettle();

    expect(t.bodies.single, <String, dynamic>{'type': 'LOCATION_SHARING'});
    expect(find.text('Withdrawn on 18 October 2026'), findsOneWidget);
  });

  testWidgets('stopping the service needs its own confirmation, then signs the elder out', (
    WidgetTester tester,
  ) async {
    bool ended = false;
    final ({List<Exchange> calls, List<Map<String, dynamic>> bodies}) t = await pump(
      tester,
      audience: ConsentAudience.elder,
      onServiceEnded: () => ended = true,
    );

    await tester.tap(find.widgetWithText(OutlinedButton, 'Stop MzaziCare'));
    await tester.pumpAndSettle();
    expect(find.text('Stop MzaziCare for you?'), findsOneWidget);

    await tester.tap(find.widgetWithText(TextButton, 'Stop MzaziCare'));
    await tester.pumpAndSettle();

    expect(t.bodies.single, <String, dynamic>{'type': 'DATA_PROCESSING', 'confirm': true});
    expect(ended, isTrue);
    expect(find.text('Underneath'), findsOneWidget);
  });

  testWidgets('a family member can read but not withdraw', (WidgetTester tester) async {
    await pump(tester, audience: ConsentAudience.careCircle, canWithdraw: false);

    expect(find.text('Withdraw'), findsNothing);
    expect(find.text('Stop MzaziCare'), findsNothing);
    expect(find.text('Only Grace or their caregiver can withdraw these.'), findsOneWidget);
  });
}
