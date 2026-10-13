import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/auth/forgot_password_screen.dart';
import 'package:mzazicare/features/auth/sign_in_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  /// [screen] in the signed-out theme, with every request body recorded. A wrong code is
  /// answered as the server answers it.
  Future<({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth})> pump(
    WidgetTester tester,
    Widget screen,
  ) async {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      final Map<String, dynamic> body = jsonDecode(request.body) as Map<String, dynamic>;
      bodies.add(body);
      if (request.url.path.endsWith('/forgot-password')) {
        return <http.Response>[http.Response('', 202)];
      }
      if (body['code'] == '000000') {
        return <http.Response>[
          json(<String, dynamic>{
            'statusCode': 400,
            'message': 'That code is wrong or has expired. Ask for a new one.',
          }, 400),
        ];
      }
      return <http.Response>[json(sessionBody())];
    });
    final AuthController auth = AuthController(api: t.api, store: SessionStore());

    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: auth,
        child: MaterialApp(theme: MzaziTheme.light(AppAudience.welcome), home: screen),
      ),
    );
    return (bodies: bodies, calls: t.calls, auth: auth);
  }

  Future<void> settle(WidgetTester tester) async {
    // Not pumpAndSettle: the resend countdown ticks every second.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> fillReset(WidgetTester tester, String code) async {
    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), code);
    await tester.enterText(find.widgetWithText(TextFormField, 'New password'), 'Brand-new-2026');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'New password again'),
      'Brand-new-2026',
    );
    await tester.tap(find.text('Set my new password'));
    await settle(tester);
  }

  testWidgets('sign-in offers it, and carries the typed number across', (
    WidgetTester tester,
  ) async {
    await pump(tester, const SignInScreen());
    await tester.enterText(find.widgetWithText(TextFormField, 'Phone number'), '0712 345 678');
    await tester.tap(find.text('Forgot your password?'));
    await tester.pumpAndSettle();

    expect(find.byType(ForgotPasswordScreen), findsOneWidget);
    expect(find.text('0712 345 678'), findsOneWidget);
  });

  testWidgets('sends the number in international format, then resets with the code', (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester, const ForgotPasswordScreen(number: '0712345678'));

    await tester.tap(find.text('Send me a code'));
    await settle(tester);

    expect(t.calls.single.path, '/api/v1/auth/forgot-password');
    expect(t.bodies.single, <String, dynamic>{'phone': '+254712345678'});
    // The same words whether or not the number has an account.
    expect(find.textContaining('If +254712345678 has an account'), findsOneWidget);
    expect(find.textContaining('Send a new code in'), findsOneWidget);

    await fillReset(tester, '123456');

    expect(t.calls.last.path, '/api/v1/auth/reset-password');
    expect(t.bodies.last, <String, dynamic>{
      'phone': '+254712345678',
      'code': '123456',
      'newPassword': 'Brand-new-2026',
    });
    expect(t.auth.isSignedIn, isTrue);
  });

  testWidgets('shows the server\'s words for a wrong code and stays signed out', (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester, const ForgotPasswordScreen(number: '0712345678'));
    await tester.tap(find.text('Send me a code'));
    await settle(tester);

    await fillReset(tester, '000000');

    expect(find.text('That code is wrong or has expired. Ask for a new one.'), findsOneWidget);
    expect(t.auth.isSignedIn, isFalse);
  });

  testWidgets('refuses two different new passwords before asking the server', (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester, const ForgotPasswordScreen(number: '0712345678'));
    await tester.tap(find.text('Send me a code'));
    await settle(tester);

    await tester.enterText(find.widgetWithText(TextFormField, 'Six-digit code'), '123456');
    await tester.enterText(find.widgetWithText(TextFormField, 'New password'), 'Brand-new-2026');
    await tester.enterText(find.widgetWithText(TextFormField, 'New password again'), 'different');
    await tester.tap(find.text('Set my new password'));
    await settle(tester);

    expect(find.text('The two passwords are different.'), findsOneWidget);
    expect(t.calls, hasLength(1));
  });
}
