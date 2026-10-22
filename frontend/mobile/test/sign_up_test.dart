import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/auth/sign_up_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  /// The sign-up screen pushed over a page, as it is in the app, with every request
  /// body recorded.
  Future<({List<Map<String, dynamic>> bodies, List<Exchange> calls})> pump(
    WidgetTester tester,
  ) async {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return <http.Response>[
        if (request.url.path.endsWith('/verify-phone'))
          http.Response('', 202)
        else
          json(sessionBody(), 201),
      ];
    });
    final AuthController auth = AuthController(api: t.api, store: SessionStore());

    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: const SignUpScreen(),
        ),
      ),
    );
    return (bodies: bodies, calls: t.calls);
  }

  Future<void> fillDetails(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextFormField, 'Your name'), 'Mary Otieno');
    await tester.enterText(find.widgetWithText(TextFormField, 'Your phone number'), '0712 345 678');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'Dev!2026x');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password again'), 'Dev!2026x');
  }

  Future<void> sendAndWait(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('asks for no code until the privacy notice is agreed', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await fillDetails(tester);

    await tester.tap(find.text('Send me a code'));
    await tester.pumpAndSettle();

    expect(find.text('You need to agree before an account can be made.'), findsOneWidget);
    expect(t.calls, isEmpty);
  });

  testWidgets('sends the number in international format, then signs up with the code', (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await fillDetails(tester);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Send me a code'));
    // Not pumpAndSettle: the resend countdown ticks every second, and settling would
    // run it down to zero before the assertions below could see it.
    await sendAndWait(tester);

    expect(t.calls.single.path, '/api/v1/auth/verify-phone');
    expect(t.bodies.single, <String, dynamic>{'phone': '+254712345678'});
    expect(find.text('Enter the code'), findsOneWidget);
    // The resend button waits out the server's own cooldown.
    expect(find.textContaining('Send a new code in'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.tap(find.text('Create my account'));
    await tester.pumpAndSettle();

    expect(t.calls.last.path, '/api/v1/auth/register');
    expect(t.bodies.last, <String, dynamic>{
      'name': 'Mary Otieno',
      'phone': '+254712345678',
      'code': '123456',
      'password': 'Dev!2026x',
      'role': 'CAREGIVER',
      'acceptedPrivacyNotice': true,
    });
  });

  testWidgets('a family member signs up as one', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await tester.tap(find.text('Family'));
    await fillDetails(tester);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Send me a code'));
    await sendAndWait(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.tap(find.text('Create my account'));
    await tester.pumpAndSettle();

    expect(t.bodies.last['role'], 'FAMILY_MEMBER');
  });

  testWidgets('a community volunteer signs up as one', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls}) t = await pump(tester);
    await tester.tap(find.text('Volunteer'));
    await tester.pump();
    expect(find.textContaining('nobody asks you anything until an administrator'), findsOneWidget);
    await fillDetails(tester);
    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.text('Send me a code'));
    await sendAndWait(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.tap(find.text('Create my account'));
    await tester.pumpAndSettle();

    expect(t.bodies.last['role'], 'COMMUNITY_RESPONDER');
  });
}
