import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/auth/sign_in_screen.dart';
import 'package:mzazicare/features/auth/sign_up_screen.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

/// Signing in, number first: the number on its own, then the password, with a code
/// offered to elders on the second step.
void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  /// The sign-in screen as the app shows it signed out, with every request body
  /// recorded. The password "wrong" is refused as the server refuses it.
  Future<({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth})> pump(
    WidgetTester tester,
  ) async {
    final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      if (request.body.isEmpty) return <http.Response>[json(<String, dynamic>{})];
      final Map<String, dynamic> body = jsonDecode(request.body) as Map<String, dynamic>;
      bodies.add(body);
      if (body['password'] == 'wrong') {
        return <http.Response>[
          json(<String, dynamic>{
            'statusCode': 401,
            'message': 'That phone number and password do not match.',
          }, 401),
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
        child: MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: const SignInScreen(),
        ),
      ),
    );
    return (bodies: bodies, calls: t.calls, auth: auth);
  }

  Future<void> toPassword(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextFormField, 'Phone number'), '0712 345 678');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
  }

  Future<void> signIn(WidgetTester tester, String password) async {
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), password);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
  }

  testWidgets('asks for the number alone first, with the notices in small print', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    expect(find.widgetWithText(TextFormField, 'Phone number'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Password'), findsNothing);
    expect(find.text('Continue'), findsOneWidget);
    expect(find.text('Create an account'), findsOneWidget);
    expect(find.text('Privacy notice'), findsOneWidget);
    expect(find.text('Terms of use'), findsOneWidget);
  });

  testWidgets('does not move on without a number', (WidgetTester tester) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextFormField, 'Password'), findsNothing);
    expect(t.calls, isEmpty);
  });

  testWidgets('then the password, and signs in with the number in international format', (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester);
    await toPassword(tester);

    expect(find.text('Enter your password'), findsOneWidget);
    expect(find.text('+254712345678'), findsOneWidget);
    expect(find.text('Forgot your password?'), findsOneWidget);

    await signIn(tester, 'Dev!2026');

    expect(t.calls.single.path, '/api/v1/auth/login');
    expect(t.bodies.single, <String, dynamic>{'phone': '+254712345678', 'password': 'Dev!2026'});
    expect(t.auth.isSignedIn, isTrue);
  });

  testWidgets("shows the server's words for a wrong password, and stays on the password", (
    WidgetTester tester,
  ) async {
    final ({List<Map<String, dynamic>> bodies, List<Exchange> calls, AuthController auth}) t =
        await pump(tester);
    await toPassword(tester);
    await signIn(tester, 'wrong');

    expect(find.text('That phone number and password do not match.'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(t.auth.isSignedIn, isFalse);
  });

  testWidgets('shows the password on request', (WidgetTester tester) async {
    await pump(tester);
    await toPassword(tester);

    TextField password() => tester.widget<TextField>(
      find.descendant(
        of: find.widgetWithText(TextFormField, 'Password'),
        matching: find.byType(TextField),
      ),
    );
    expect(password().obscureText, isTrue);
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(password().obscureText, isFalse);
  });

  testWidgets('back from the password goes to the number, with it still typed in', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await toPassword(tester);

    // The phone's own back first, then the arrow on the screen.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Continue'), findsOneWidget);
    expect(find.text('0712 345 678'), findsOneWidget);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Change the number'));
    await tester.pumpAndSettle();
    expect(find.text('Continue'), findsOneWidget);
  });

  testWidgets('the back arrow lines up with the page below it', (WidgetTester tester) async {
    await pump(tester);
    await toPassword(tester);

    // The arrow itself, not the touch target around it, starts where the words do.
    expect(
      tester.getTopLeft(find.byIcon(Icons.arrow_back)).dx,
      moreOrLessEquals(tester.getTopLeft(find.text('Enter your password')).dx, epsilon: 1),
    );
    // And the touch target is still full size.
    expect(
      tester.getSize(find.byTooltip('Change the number')).width,
      greaterThanOrEqualTo(MzaziA11y.standardMinTouchTarget),
    );
  });

  testWidgets('somebody new goes to sign-up', (WidgetTester tester) async {
    await pump(tester);

    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();

    expect(find.byType(SignUpScreen), findsOneWidget);
  });
}
